// Exercise the compiled production Worker in an isolated Miniflare environment.
// Fixture identity headers stand in for the hosting gateway, never a real user.
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { Miniflare } = require(require.resolve("miniflare", { paths: [require.resolve("wrangler/package.json")] }));
const modules = (await readdir("dist/server", {recursive:true})).filter(p=>/\.m?js$/.test(p)).sort((a,b)=>a==="index.js"?-1:b==="index.js"?1:a.localeCompare(b)).map(path=>({type:"ESModule",path:resolve("dist/server",path)}));
const mf = new Miniflare({
  name: "receiveright-test", modules, modulesRoot: "dist/server",
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"], r2Buckets: ["BUCKET"], assets: { directory: "dist/client", routerConfig: { has_user_worker: true } },
});
const origin="http://receiveright.test";
function headers(owner="fixture-a") { return {"Content-Type":"application/json","Accept":"application/json, text/event-stream","MCP-Protocol-Version":"2025-11-25", Origin:origin,"oai-authenticated-user-id":owner,"oai-authenticated-user-email":`${owner}@example.test`}; }
async function rpc(method,params={},owner="fixture-a") {
  const response=await mf.dispatchFetch(`${origin}/mcp`,{method:"POST",headers:headers(owner),body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
  assert.equal(response.status,200,await response.clone().text()); return (await response.json()).result;
}
async function call(name,args={},owner="fixture-a") { const result=await rpc("tools/call",{name,arguments:args},owner); assert.equal(result.isError,false,result.content?.[0]?.text); return JSON.parse(result.content[0].text); }
async function browserCall(name,args={},owner="fixture-a") {
  const response=await mf.dispatchFetch(`${origin}/api/receiving`,{method:"POST",headers:headers(owner),body:JSON.stringify({name,arguments:args})});
  assert.equal(response.status,200,await response.clone().text()); return response.json();
}
try {
  const db=await mf.getD1Database("DB");
  const sql=await readFile("drizzle/0000_petite_bullseye.sql","utf8");
  for(const statement of sql.split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
  const signedOutPage=await mf.dispatchFetch(origin);
  assert.equal(signedOutPage.status,200);
  const signInHtml=await signedOutPage.text();
  assert.match(signInHtml,/Sign in with ChatGPT/); assert.match(signInHtml,/target="_top"/);
  const signedInPage=await mf.dispatchFetch(origin,{headers:headers()});
  assert.equal(signedInPage.status,200); assert.match(await signedInPage.text(),/A clearer way to receive/);
  const unsignedBrowser=await mf.dispatchFetch(`${origin}/api/receiving`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({name:"get_workspace"})});
  assert.equal(unsignedBrowser.status,401); assert.equal((await unsignedBrowser.json()).signInUrl,"/signin-with-chatgpt?return_to=%2F");
  const crossOriginBrowser=await mf.dispatchFetch(`${origin}/api/receiving`,{method:"POST",headers:{...headers(),Origin:"https://untrusted.example"},body:JSON.stringify({name:"get_workspace"})});
  assert.equal(crossOriginBrowser.status,403);
  const assistantStatus = await mf.dispatchFetch(`${origin}/api/assistant`, { headers: headers() });
  assert.equal(assistantStatus.status, 200); assert.equal((await assistantStatus.json()).configured, false);
  assert.equal((await mf.dispatchFetch(`${origin}/api/assistant`)).status, 401);
  const assistantBody = JSON.stringify({ orderId: "fixture", messages: [{ role: "user", text: "Hello" }] });
  const blockedAgent = await mf.dispatchFetch(`${origin}/api/assistant`, { method: "POST", headers: { ...headers(), Origin: "https://untrusted.example" }, body: assistantBody });
  assert.equal(blockedAgent.status, 403);
  const unsignedAgent = await mf.dispatchFetch(`${origin}/api/assistant`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: assistantBody });
  assert.equal(unsignedAgent.status, 401);
  const missingProvider = await mf.dispatchFetch(`${origin}/api/assistant`, { method: "POST", headers: headers(), body: assistantBody });
  assert.equal(missingProvider.status, 503); assert.match((await missingProvider.json()).error, /configuration/);
  assert.equal((await mf.dispatchFetch(`${origin}/mcp`)).status,405);
  assert.equal((await mf.dispatchFetch(`${origin}/mcp`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"})})).status,401);
  assert.equal((await mf.dispatchFetch(`${origin}/mcp`,{method:"POST",headers:{...headers(),Origin:"https://untrusted.example"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"})})).status,403);
  const init=await rpc("initialize",{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"smoke-test",version:"1"}}); assert.equal(init.protocolVersion,"2025-11-25");
  const discovery=await rpc("server/discover"); assert.ok(discovery.supportedVersions.includes("2026-07-28"));
  const tools=await rpc("tools/list"); assert.equal(tools.tools.length,11);
  const notification=await mf.dispatchFetch(`${origin}/mcp`,{method:"POST",headers:headers(),body:JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})}); assert.equal(notification.status,202);
  const seeded=await call("load_demo_orders"); const order=seeded.workspace.orders[0];
  assert.deepEqual((await browserCall("get_workspace")).workspace,seeded.workspace);
  const browserOrder=await browserCall("import_purchase_order",{reference:"BROWSER-1",supplier:"Fixture supplier",expected:"2026-10-16",lines:[{name:"Cups",ordered:3,unit:"boxes"}]});
  const browserDraft=await browserCall("start_receiving",{orderId:browserOrder.result.id});
  await browserCall("record_received_items",{draftId:browserDraft.result.id,lineId:browserOrder.result.lines[0].id,received:3,damaged:0});
  const browserPreview=await browserCall("preview_receipt",{draftId:browserDraft.result.id});
  await browserCall("confirm_receipt",{token:browserPreview.result.token,confirmed:true});
  assert.equal((await browserCall("get_workspace")).workspace.receipts.length,1);
  const opened=await call("start_receiving",{orderId:order.id}); const draft=opened.result;
  await call("record_received_items",{draftId:draft.id,lineId:order.lines[0].id,received:10,damaged:1});
  const bad=await rpc("tools/call",{name:"record_received_items",arguments:{draftId:draft.id,lineId:order.lines[0].id,received:10,damaged:11}}); assert.equal(bad.isError,true);
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jw9kAAAAASUVORK5CYII=","base64");
  const uploaded=await mf.dispatchFetch(`${origin}/api/evidence`,{method:"POST",headers:{...headers(),"Content-Type":"image/png","Content-Length":String(png.length),"X-File-Name":"test-evidence.png"},body:png});
  assert.equal(uploaded.status,200,await uploaded.clone().text()); const photo=await uploaded.json();
  await call("attach_evidence",{draftId:draft.id,evidenceId:photo.id});
  const ownPhoto=await mf.dispatchFetch(`${origin}/api/evidence?id=${photo.id}`,{headers:headers()}); assert.equal(ownPhoto.status,200); assert.equal((await ownPhoto.arrayBuffer()).byteLength,png.length);
  const foreignPhoto=await mf.dispatchFetch(`${origin}/api/evidence?id=${photo.id}`,{headers:headers("fixture-b")}); assert.equal(foreignPhoto.status,404);
  assert.equal((await call("get_workspace",{},"fixture-b")).workspace.orders.length,0);
  const foreignDraft=await rpc("tools/call",{name:"preview_receipt",arguments:{draftId:draft.id}},"fixture-b"); assert.equal(foreignDraft.isError,true);
  const preview=await call("preview_receipt",{draftId:draft.id}); assert.equal(preview.result.totals[0].missing,2); assert.equal(preview.result.totals[0].accepted,9);
  const saves=await Promise.all([call("confirm_receipt",{token:preview.result.token,confirmed:true}),call("confirm_receipt",{token:preview.result.token,confirmed:true})]); assert.equal(saves[0].result.id,saves[1].result.id);
  const persisted=await call("get_workspace"); assert.equal(persisted.workspace.receipts.length,2); assert.equal(persisted.workspace.receipts.find(r=>r.orderId===order.id).evidence.length,1);
  const next=await call("start_receiving",{orderId:order.id}); await call("record_received_items",{draftId:next.result.id,lineId:order.lines[0].id,received:2,damaged:0});
  const nextPreview=await call("preview_receipt",{draftId:next.result.id}); assert.equal(nextPreview.result.totals[0].missing,0); assert.equal(nextPreview.result.totals[0].accepted,11);
  await call("confirm_receipt",{token:nextPreview.result.token,confirmed:true});
  const report=await call("draft_discrepancy_report",{orderId:order.id}); assert.match(report.result.text,/0 still undelivered/); assert.match(report.result.text,/No message has been sent/);
  console.log("PASS: signed-in/signed-out page rendering, browser API receiving flow, MCP lifecycle, origin/auth checks, persistent D1 receipts, concurrent confirmation retries, follow-up delivery, private R2 photos and user isolation.");
} finally { await mf.dispose(); }
