// Real compiled Worker + D1, with deterministic Bedrock HTTP fixtures only.
// No AWS requests, credentials, production data or model-quality claims.
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { Miniflare } = require(require.resolve("miniflare", { paths: [require.resolve("wrangler/package.json")] }));
const modules = (await readdir("dist/server", { recursive: true })).filter(p => /\.m?js$/.test(p)).sort((a,b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b)).map(path => ({ type: "ESModule", path: resolve("dist/server", path) }));
const origin = "http://receiveright.test";
const headers = (owner = "agent-fixture") => ({ "Content-Type": "application/json", Origin: origin, "oai-authenticated-user-id": owner, "oai-authenticated-user-email": `${owner}@example.test` });
let modelSteps = [];
let modelCalls = 0;
const assistant = text => Response.json({ output: { message: { role: "assistant", content: [{ text }] } }, stopReason: "end_turn" });
const tool = (name, input) => Response.json({ output: { message: { role: "assistant", content: [{ toolUse: { toolUseId: crypto.randomUUID(), name, input } }] } }, stopReason: "tool_use" });
const context = request => request.messages.at(-1).content[0].toolResult.content[0].json.context;
const mf = new Miniflare({
  name: "receiveright-agent-test", modules, modulesRoot: "dist/server",
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"], r2Buckets: ["BUCKET"], assets: { directory: "dist/client", routerConfig: { has_user_worker: true } },
  bindings: { AWS_BEARER_TOKEN_BEDROCK: "fixture-never-valid", AWS_REGION: "us-east-1", BEDROCK_MODEL_ID: "fixture.model" },
  outboundService: async request => {
    assert.equal(new URL(request.url).hostname, "bedrock-runtime.us-east-1.amazonaws.com");
    assert.equal(request.headers.get("authorization"), "Bearer fixture-never-valid");
    modelCalls++;
    const next = modelSteps.shift();
    assert.ok(next, "Unexpected model request");
    return next(await request.json());
  },
});
async function call(name, args = {}) {
  const response = await mf.dispatchFetch(`${origin}/api/receiving`, { method: "POST", headers: headers(), body: JSON.stringify({ name, arguments: args }) });
  assert.equal(response.status, 200, await response.clone().text()); return response.json();
}
async function agent(orderId, text = "Ten arrived including one damaged.", owner) {
  return mf.dispatchFetch(`${origin}/api/assistant`, { method: "POST", headers: headers(owner), body: JSON.stringify({ orderId, messages: [{ role: "user", text }] }) });
}
try {
  const db = await mf.getD1Database("DB");
  for (const statement of (await readFile("drizzle/0000_petite_bullseye.sql", "utf8")).split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  const status = await mf.dispatchFetch(`${origin}/api/assistant`, { headers: headers() });
  const statusText = await status.text(); assert.match(statusText, /"configured":true/); assert.ok(!statusText.includes("fixture-never-valid"));
  const { workspace } = await call("load_demo_orders"); const order = workspace.orders[0];
  modelSteps = [
    () => tool("start_receiving", { orderId: order.id }),
    request => tool("record_received_items", { draftId: context(request).currentDraft.id, lineId: order.lines[0].id, received: 10, damaged: 1 }),
    request => tool("preview_receipt", { draftId: context(request).currentDraft.id }),
    () => assistant("9 accepted, 1 damaged, 2 undelivered. Review before confirming."),
  ];
  const response = await agent(order.id); assert.equal(response.status, 200, await response.clone().text());
  const received = await response.json(); assert.equal(received.review.totals[0].accepted, 9);
  const saved = await call("get_workspace"); assert.equal(saved.workspace.drafts[0].counts[0].received, 10); assert.equal(saved.workspace.receipts.length, 0);
  assert.equal(modelCalls, 4); assert.equal(modelSteps.length, 0);

  const beforeFailure = saved.workspace;
  modelSteps = [
    () => tool("record_received_items", { draftId: received.review.draft.id, lineId: order.lines[0].id, received: 11, damaged: 1 }),
    () => new Response("private-provider-error", { status: 500 }),
  ];
  const failed = await agent(order.id, "Actually eleven arrived, including one damaged.");
  assert.equal(failed.status, 502); const failedText = await failed.text(); assert.ok(!failedText.includes("private-provider-error")); assert.equal(JSON.parse(failedText).category, "provider_error");
  assert.deepEqual((await call("get_workspace")).workspace, beforeFailure, "Failed conversation must roll back all staged changes");

  modelSteps = [
    () => tool("record_received_items", { draftId: received.review.draft.id, lineId: order.lines[0].id, received: 11, damaged: 1 }),
    async () => { await call("update_receiving_note", { draftId: received.review.draft.id, note: "A person edited this while the model was responding." }); return assistant("Prepared eleven."); },
  ];
  const conflict = await agent(order.id, "Actually eleven arrived, including one damaged.");
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).category, "conflict", "a concurrent edit is not reported as a provider failure");
  const concurrent = (await call("get_workspace")).workspace;
  assert.equal(concurrent.drafts[0].counts[0].received, 10); assert.match(concurrent.drafts[0].note, /person edited/);
  const countBefore = modelCalls;
  const foreign = await agent(order.id, "Read that order", "different-user"); assert.equal(foreign.status, 404); assert.equal(modelCalls, countBefore);
  // Explicit connection test: origin + auth checks, real outcome only, no provider text, no retries.
  const testCall = (extra = {}, owner) => mf.dispatchFetch(`${origin}/api/assistant/test`, { method: "POST", headers: { ...headers(owner), ...extra } });
  const callsBeforeTest = modelCalls;
  assert.equal((await testCall({ Origin: "https://untrusted.example" })).status, 403);
  assert.equal((await mf.dispatchFetch(`${origin}/api/assistant/test`, { method: "POST", headers: { Origin: origin } })).status, 401);
  assert.equal(modelCalls, callsBeforeTest, "rejected tests never reach the model");
  modelSteps = [() => new Response(JSON.stringify({ Message: "Bearer Token has expired private-provider-error" }), { status: 403, headers: { "x-amzn-ErrorType": "AccessDeniedException:http://internal" } })];
  const expired = await testCall(); const expiredText = await expired.text(); const expiredBody = JSON.parse(expiredText);
  assert.equal(expired.status, 502); assert.equal(expiredBody.ok, false); assert.equal(expiredBody.category, "expired_credentials");
  assert.ok(!expiredText.includes("private-provider-error") && !expiredText.includes("fixture-never-valid"));
  assert.equal(modelCalls, callsBeforeTest + 1, "one request, no automatic retry");
  modelSteps = [() => assistant("OK")];
  const passed = await (await testCall()).json();
  assert.equal(passed.ok, true); assert.equal(passed.stopReason, "end_turn"); assert.equal(passed.model, "fixture.model"); assert.ok(Date.parse(passed.testedAt));
  assert.deepEqual((await call("get_workspace")).workspace, concurrent, "connection tests change no receiving data");
  console.log("PASS: configured agent HTTP route, actual staged receiving operations, D1 commit, provider failure rollback, concurrent edit protection, user isolation, failure categories and the explicit connection test (origin/auth, expired key, success, no data change). Bedrock responses were fixtures; no live AWS call was made.");
} finally { await mf.dispose(); }
