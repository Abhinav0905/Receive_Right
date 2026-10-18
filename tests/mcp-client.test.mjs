import test from "node:test";
import assert from "node:assert/strict";
import { createMcpClient, parseSseMessages, redact, McpError } from "../lib/mcp-client.ts";

// A scripted HTTP peer: records what the client sent and answers like an MCP server would.
function peer(handler) {
  const sent = [];
  const fetch = async (url, init) => { const body = JSON.parse(init.body); sent.push({ url, headers: init.headers, body }); return handler(body, init.headers); };
  return { sent, fetch };
}
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
const ok = (id, result) => json({ jsonrpc: "2.0", id, result });

test("lifecycle sends initialize, initialized, then tools with the negotiated version header", async () => {
  const p = peer(m => m.method === "initialize" ? ok(m.id, { protocolVersion: "2025-11-25", serverInfo: { name: "fixture" } })
    : m.method === "notifications/initialized" ? new Response(null, { status: 202 })
    : m.method === "tools/list" ? ok(m.id, { tools: [{ name: "get_workspace" }] })
    : ok(m.id, { content: [{ type: "text", text: "{}" }], isError: false }));
  const trace = [];
  const client = createMcpClient({ endpoint: "/mcp", fetch: p.fetch, onTrace: e => trace.push(e) });
  await client.connect(); await client.listTools(); await client.callTool("get_workspace");
  assert.deepEqual(p.sent.map(s => s.body.method), ["initialize", "notifications/initialized", "tools/list", "tools/call"]);
  assert.equal(p.sent[0].body.params.protocolVersion, "2025-11-25");
  assert.ok(p.sent[0].body.params.clientInfo.name && p.sent[0].body.params.capabilities);
  assert.equal("id" in p.sent[1].body, false, "notifications carry no id");
  assert.equal(p.sent[0].headers["MCP-Protocol-Version"], undefined);
  assert.ok(p.sent.slice(1).every(s => s.headers["MCP-Protocol-Version"] === "2025-11-25"));
  assert.ok(p.sent.every(s => s.headers.Accept === "application/json, text/event-stream" && s.headers["Content-Type"] === "application/json"));
  const ids = p.sent.filter(s => "id" in s.body).map(s => s.body.id);
  assert.equal(new Set(ids).size, ids.length); assert.ok(ids.every(Number.isInteger));
  assert.deepEqual(trace.map(t => [t.method, t.httpStatus, t.ok]), [["initialize", 200, true], ["notifications/initialized", 202, true], ["tools/list", 200, true], ["tools/call · get_workspace", 200, true]]);
  assert.ok(trace.every(t => t.transport === "HTTP POST /mcp" && typeof t.durationMs === "number"));
});

test("an unsupported negotiated version stops the lifecycle before initialized is sent", async () => {
  const p = peer(m => ok(m.id, { protocolVersion: "2099-01-01" }));
  const client = createMcpClient({ endpoint: "/mcp", fetch: p.fetch });
  await assert.rejects(client.connect(), /does not support/);
  assert.equal(p.sent.length, 1); assert.equal(client.negotiatedVersion, null);
  await assert.rejects(client.listTools(), /connect/);
});

test("session ids returned by initialize are sent back", async () => {
  const p = peer(m => m.method === "initialize" ? json({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-11-25" } }, 200, { "Mcp-Session-Id": "abc123" })
    : m.method.startsWith("notifications/") ? new Response(null, { status: 202 }) : ok(m.id, { tools: [] }));
  const trace = [];
  const client = createMcpClient({ endpoint: "/mcp", fetch: p.fetch, onTrace: e => trace.push(e) });
  await client.connect(); await client.listTools();
  assert.equal(p.sent[2].headers["Mcp-Session-Id"], "abc123");
  assert.equal(trace[2].requestHeaders["Mcp-Session-Id"], "[redacted]", "the real id is sent but never traced");
});

test("event-stream responses are parsed, skipping priming events and unrelated messages", async () => {
  assert.deepEqual(parseSseMessages("id: 1\ndata:\n\nevent: message\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\"}\n\ndata: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{}}\r\n\r\n"),
    [{ jsonrpc: "2.0", method: "notifications/progress" }, { jsonrpc: "2.0", id: 2, result: {} }]);
  const sse = body => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const p = peer(m => m.method === "initialize" ? sse(`id: a\ndata:\n\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-11-25" } })}\n\n`)
    : m.method.startsWith("notifications/") ? new Response(null, { status: 202 })
    : sse(`data: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: {} })}\n\n`));
  const client = createMcpClient({ endpoint: "/mcp", fetch: p.fetch });
  assert.equal((await client.connect()).protocolVersion, "2025-11-25");
  await assert.rejects(client.listTools(), /closed before the response/);
});

test("protocol errors, HTTP errors and mismatched ids are reported, not treated as success", async () => {
  const p = peer(m => m.method === "initialize" ? ok(m.id, { protocolVersion: "2025-11-25" })
    : m.method.startsWith("notifications/") ? new Response(null, { status: 202 })
    : m.method === "tools/list" ? ok(m.id + 100, { tools: [] })
    : json({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "Unknown tool" } }, 400));
  const trace = [];
  const client = createMcpClient({ endpoint: "/mcp", fetch: p.fetch, onTrace: e => trace.push(e) });
  await client.connect();
  await assert.rejects(client.listTools(), /does not match/);
  await assert.rejects(client.callTool("nope"), e => e instanceof McpError && e.code === -32602 && e.httpStatus === 400);
  assert.deepEqual(trace.slice(2).map(t => t.ok), [false, false]);
  const denied = createMcpClient({ endpoint: "/mcp", fetch: async () => new Response("Sign in to ReceiveRight to use this workspace.", { status: 401 }) });
  await assert.rejects(denied.connect(), e => e.httpStatus === 401);
  const down = createMcpClient({ endpoint: "/mcp", fetch: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(down.connect(), /Network error/);
});

test("trace sanitization removes tokens, identity, notes and photo names, including JSON inside text content", () => {
  const text = JSON.stringify({ workspace: { orders: [1, 2], drafts: [{ token: "secret-token" }], receipts: [] }, result: { token: "secret-token", draft: { note: "Call Dana at 555-0100", evidence: [{ id: "e1", name: "IMG_4412.jpg" }], counts: [{ received: 3 }] } } });
  const out = JSON.stringify(redact({ result: { content: [{ type: "text", text }] }, headers: { Cookie: "a=b", "oai-authenticated-user-email": "x@example.test" } }));
  for (const secret of ["secret-token", "555-0100", "IMG_4412", "a=b", "x@example.test"]) assert.ok(!out.includes(secret), secret);
  assert.match(out, /"orders":2/); assert.match(out, /"received":3/);
});

test("only a response answers a request on an event stream, and notifications need 202", async () => {
  const sse = body => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const p = peer(m => m.method === "initialize" ? ok(m.id, { protocolVersion: "2025-11-25" })
    : m.method.startsWith("notifications/") ? new Response(null, { status: 202 })
    : sse(`data: ${JSON.stringify({ jsonrpc: "2.0", id: m.id, method: "ping" })}\n\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "x" }] } })}\n\n`));
  const client = createMcpClient({ endpoint: "/mcp", fetch: p.fetch });
  await client.connect();
  assert.deepEqual((await client.listTools()).map(t => t.name), ["x"], "a server request with the same id is not taken as the response");
  const lax = createMcpClient({ endpoint: "/mcp", fetch: async (u, init) => JSON.parse(init.body).method === "initialize" ? ok(1, { protocolVersion: "2025-11-25" }) : json({ jsonrpc: "2.0", error: { code: -32600, message: "nope" } }, 200) });
  await assert.rejects(lax.connect(), /expected 202/);
});
