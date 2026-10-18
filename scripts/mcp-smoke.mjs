// Repeatable MCP protocol smoke check against a locally running `pnpm dev` server.
//
// Prerequisites: `pnpm setup:local` once, then `pnpm dev` running in another terminal.
// Usage:  pnpm mcp:smoke                    read-only lifecycle + negative checks
//         pnpm mcp:smoke -- --draft         also prepare a draft review on DEMO-MCP-CHECK (never confirms)
//         pnpm mcp:smoke -- --base http://127.0.0.1:5174
//
// Authentication: the script signs in through the loopback-only development sign-in route, exactly as the
// browser's "Sign in" button does locally, and refuses non-loopback URLs. It cannot authenticate to a hosted site.
import { createMcpClient } from "../lib/mcp-client.ts";
import { runMcpCheck, runMcpDraftPreview } from "../lib/mcp-check.ts";

const args = process.argv.slice(2);
const base = new URL(args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:5173");
const draft = args.includes("--draft");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  console.error(`Refusing ${base.origin}: this smoke check uses the loopback-only development sign-in.`);
  process.exit(2);
}
const endpoint = new URL("/mcp", base).href;
let failures = 0;
const check = (label, ok, detail = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`); };

let signIn;
try {
  signIn = await fetch(new URL("/signin-with-chatgpt?return_to=%2F", base), { redirect: "manual" });
} catch (error) {
  console.error(`Could not reach ${base.origin}. Start the app with \`pnpm dev\` first. (${error.message})`);
  process.exit(2);
}
const cookie = (signIn.headers.getSetCookie?.() ?? [signIn.headers.get("set-cookie") ?? ""]).map(c => c.split(";")[0]).find(c => c.startsWith("__sites_local_auth="));
check("local development sign-in returned a session cookie", !!cookie, `HTTP ${signIn.status}`);
if (!cookie) process.exit(1);

const trace = [];
const client = createMcpClient({ endpoint, headers: { Cookie: cookie }, clientInfo: { name: "receiveright-mcp-smoke", version: "0.2.0" }, onTrace: e => trace.push(e) });
try {
  const result = await runMcpCheck(client);
  check("initialize negotiated a supported protocol", !!result.protocolVersion, result.protocolVersion);
  check("tools/list discovered tools", result.tools.length > 0, `${result.tools.length}: ${result.tools.join(", ")}`);
  check("tools/call get_workspace returned the workspace", true, `${result.counts.orders} orders, ${result.counts.drafts} drafts, ${result.counts.receipts} receipts`);
  const view = await fetch(new URL("/api/receiving", base), { method: "POST", headers: { Cookie: cookie, Origin: base.origin, "Content-Type": "application/json" }, body: JSON.stringify({ name: "get_workspace" }) });
  const viewWorkspace = (await view.json()).workspace;
  const { sameWorkspace } = await import("../lib/mcp-check.ts");
  check("MCP workspace matches the website receiving API (not MCP)", view.ok && sameWorkspace(result.workspace, viewWorkspace));
  if (draft) {
    const preview = await runMcpDraftPreview(client);
    const t = preview.totals[0];
    check(`draft review prepared on ${preview.order} via tools/call (no confirmation)`, preview.reviewPrepared, `${t.received} received, ${t.damaged} damaged, ${t.accepted} accepted, ${t.missing} undelivered`);
  }
} catch (error) {
  check("MCP lifecycle", false, error.message);
}

// Negative checks: authentication, origin validation, malformed input, unknown tool, unsupported version.
const post = (body, headers = {}) => fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers }, body });
const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
check("unauthenticated request rejected", (await post(ping)).status === 401);
check("cross-origin request rejected", (await post(ping, { Cookie: cookie, Origin: "https://untrusted.example" })).status === 403);
const parse = await post("{not json", { Cookie: cookie });
check("malformed JSON returns JSON-RPC parse error", parse.status === 400 && (await parse.json()).error?.code === -32700);
const unknown = await post(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "confirm_everything" } }), { Cookie: cookie, "MCP-Protocol-Version": "2025-11-25" });
check("unknown tool returns -32602", (await unknown.json()).error?.code === -32602);
const version = await post(ping, { Cookie: cookie, "MCP-Protocol-Version": "1999-01-01" });
check("unsupported MCP-Protocol-Version rejected", version.status === 400);

console.log("\nHTTP requests made by the MCP client:");
for (const e of trace) console.log(`  ${e.step}. ${e.method.padEnd(26)} ${e.transport}  HTTP ${e.httpStatus ?? "-"}  ${e.durationMs} ms${e.error ? `  ERROR ${e.error}` : ""}`);
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll MCP smoke checks passed.");
process.exit(failures ? 1 : 0);
