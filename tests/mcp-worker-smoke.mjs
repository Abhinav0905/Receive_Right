// The reusable MCP client against the compiled production Worker (Miniflare + local D1).
// Every step is an HTTP request dispatched into the built runtime; identity headers stand in for the hosting gateway.
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createMcpClient, McpError } from "../lib/mcp-client.ts";
import { runMcpCheck, runMcpDraftPreview, sameWorkspace } from "../lib/mcp-check.ts";
const require = createRequire(import.meta.url);
const { Miniflare } = require(require.resolve("miniflare", { paths: [require.resolve("wrangler/package.json")] }));
const modules = (await readdir("dist/server", { recursive: true })).filter(p => /\.m?js$/.test(p)).sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b)).map(path => ({ type: "ESModule", path: resolve("dist/server", path) }));
const origin = "http://receiveright.test";
const mf = new Miniflare({
  name: "receiveright-mcp-test", modules, modulesRoot: "dist/server", compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"], r2Buckets: ["BUCKET"], assets: { directory: "dist/client", routerConfig: { has_user_worker: true } },
});
const identity = owner => ({ "oai-authenticated-user-id": owner, "oai-authenticated-user-email": `${owner}@example.test` });
// The client sees only fetch; this one sends the request into the compiled Worker as a browser on this origin would.
const fetchAs = (owner, extra = {}) => async (url, init) => mf.dispatchFetch(new URL(url, origin).href, { ...init, headers: { ...init.headers, Origin: origin, ...(owner ? identity(owner) : {}), ...extra } });
try {
  const db = await mf.getD1Database("DB");
  for (const statement of (await readFile("drizzle/0000_petite_bullseye.sql", "utf8")).split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();

  const trace = [];
  const client = createMcpClient({ endpoint: "/mcp", fetch: fetchAs("mcp-a"), transportLabel: "HTTP POST /mcp (Miniflare dispatchFetch into the built Worker)", onTrace: e => trace.push(e) });
  const empty = await runMcpCheck(client);
  assert.equal(client.negotiatedVersion, "2025-11-25"); assert.equal(empty.protocolVersion, "2025-11-25");
  assert.deepEqual(trace.slice(0, 4).map(e => [e.method, e.httpStatus]), [["initialize", 200], ["notifications/initialized", 202], ["tools/list", 200], ["tools/call · get_workspace", 200]]);
  assert.equal(trace[0].requestHeaders["MCP-Protocol-Version"], undefined, "no version header before negotiation");
  assert.ok(trace.slice(1).every(e => e.requestHeaders["MCP-Protocol-Version"] === "2025-11-25"), "negotiated version header on later requests");
  assert.deepEqual(new Set(trace.map(e => e.id).filter(id => id !== null)).size, 3, "unique JSON-RPC ids");
  assert.ok(empty.tools.includes("get_workspace") && empty.tools.includes("create_demo_order") && empty.tools.includes("confirm_receipt"));
  assert.deepEqual(empty.counts, { orders: 0, drafts: 0, receipts: 0 });

  // A real tools/call mutation through MCP, then the same data through the website API.
  const preview = await runMcpDraftPreview(client);
  assert.equal(preview.order, "DEMO-MCP-CHECK"); assert.equal(preview.reviewPrepared, true);
  assert.deepEqual([preview.totals[0].received, preview.totals[0].damaged, preview.totals[0].accepted, preview.totals[0].missing], [3, 1, 2, 1]);
  const viaWebsite = await (await fetchAs("mcp-a")(`${origin}/api/receiving`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "get_workspace" }) })).json();
  const after = await runMcpCheck(createMcpClient({ endpoint: "/mcp", fetch: fetchAs("mcp-a") }), async () => viaWebsite.workspace);
  assert.equal(after.matchesReceivingView, true); assert.equal(after.counts.receipts, 0, "the preview never confirms");
  assert.ok(sameWorkspace(after.workspace, viaWebsite.workspace));
  // Repeating the explicit action reuses the dedicated order instead of adding more.
  await runMcpDraftPreview(client);
  const again = await runMcpCheck(createMcpClient({ endpoint: "/mcp", fetch: fetchAs("mcp-a") }));
  assert.equal(again.workspace.orders.filter(o => o.reference === "DEMO-MCP-CHECK").length, 1); assert.equal(again.counts.drafts, 1);
  // Sanitized trace: confirmation tokens and identity never appear.
  const traced = JSON.stringify(trace);
  assert.equal(again.workspace.drafts[0].token, undefined, "MCP tool output never exposes stored review tokens");
  assert.ok(!/"token":"[0-9a-f-]{36}"/.test(traced), "review token redacted from the trace");
  assert.ok(!traced.includes("mcp-a@example.test"));

  // Owner isolation: another identity sees an empty workspace and cannot preview the first owner's draft.
  const other = createMcpClient({ endpoint: "/mcp", fetch: fetchAs("mcp-b") });
  assert.equal((await runMcpCheck(other)).counts.orders, 0);
  const foreign = await other.callTool("preview_receipt", { draftId: again.workspace.drafts[0].id });
  assert.equal(foreign.isError, true);

  // Authentication, origin and malformed input.
  const anonymous = createMcpClient({ endpoint: "/mcp", fetch: fetchAs(null) });
  await assert.rejects(anonymous.connect(), e => e instanceof McpError && e.httpStatus === 401);
  const crossSite = createMcpClient({ endpoint: "/mcp", fetch: fetchAs("mcp-a", { Origin: "https://untrusted.example" }) });
  await assert.rejects(crossSite.connect(), e => e instanceof McpError && e.httpStatus === 403);
  const raw = createMcpClient({ endpoint: "/mcp", fetch: fetchAs("mcp-a") }); await raw.connect();
  await assert.rejects(raw.callTool("confirm_everything", {}), e => e.code === -32602);
  await assert.rejects(raw.raw("no/such/method", {}), e => e.code === -32601);
  const badJson = await fetchAs("mcp-a")(`${origin}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(badJson.status, 400); assert.equal((await badJson.json()).error.code, -32700);
  const nullId = await fetchAs("mcp-a")(`${origin}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: null, method: "tools/list" }) });
  assert.equal(nullId.status, 400); assert.equal((await nullId.json()).error.code, -32600);
  const badVersion = await fetchAs("mcp-a")(`${origin}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "1999-01-01" }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }) });
  assert.equal(badVersion.status, 400);
  const badTool = await raw.callTool("record_received_items", { draftId: again.workspace.drafts[0].id, lineId: again.workspace.orders[0].lines[0].id, received: 1, damaged: 2 });
  assert.equal(badTool.isError, true, "invalid counts are a tool error, not a protocol error");
  console.log("PASS: reusable MCP client over HTTP against the compiled Worker: initialize/initialized/tools/list/tools/call, version header, unique ids, demo draft preview without confirmation, match with the website API, redacted trace, owner isolation, 401/403, -32700/-32600 (null id)/-32601/-32602, unsupported version.");
} finally { await mf.dispose(); }
