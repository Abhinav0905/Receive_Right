import test from "node:test";
import assert from "node:assert/strict";
import { emptyWorkspace, executeTool, summary, parseReceivingText, discrepancyReport } from "../lib/receiving.ts";

function scenario() {
  const state = emptyWorkspace();
  executeTool(state, "load_demo_orders", {});
  const order = state.orders[0];
  const { result: draft } = executeTool(state, "start_receiving", { orderId: order.id });
  return { state, order, draft, record: (received, damaged) => executeTool(state, "record_received_items", { draftId: draft.id, lineId: order.lines[0].id, received, damaged }) };
}
test("12 ordered, 10 received including 1 damaged means 9 accepted and 2 undelivered", () => {
  const {state,order,draft,record} = scenario(); record(10,1);
  const line=summary(state,order.id,draft)[0];
  assert.deepEqual([line.ordered,line.received,line.damaged,line.accepted,line.missing],[12,10,1,9,2]);
  assert.equal(state.receipts.length,0);
});
test("receipt confirmation requires explicit approval and is retry-safe", () => {
  const {state,draft,record}=scenario(); record(10,1);
  const {result:{token}}=executeTool(state,"preview_receipt",{draftId:draft.id});
  assert.throws(()=>executeTool(state,"confirm_receipt",{token,confirmed:false}));
  const a=executeTool(state,"confirm_receipt",{token,confirmed:true}).result;
  const b=executeTool(state,"confirm_receipt",{token,confirmed:true}).result;
  assert.equal(a.id,b.id); assert.equal(state.receipts.length,1); assert.equal(state.drafts.length,0);
});
test("edits invalidate a preview; a new review is required", () => {
  const {state,draft,record}=scenario(); record(10,1);
  const {result:{token}}=executeTool(state,"preview_receipt",{draftId:draft.id});
  record(11,1);
  assert.throws(()=>executeTool(state,"confirm_receipt",{token,confirmed:true}),/out of date/);
  assert.equal(state.receipts.length,0);
});
test("later delivery accumulates once and preserves damage history", () => {
  const {state,order,draft,record}=scenario(); record(10,1);
  const {result:{token}}=executeTool(state,"preview_receipt",{draftId:draft.id});
  executeTool(state,"confirm_receipt",{token,confirmed:true});
  const next=executeTool(state,"start_receiving",{orderId:order.id}).result;
  executeTool(state,"record_received_items",{draftId:next.id,lineId:order.lines[0].id,received:2,damaged:0});
  const preview=executeTool(state,"preview_receipt",{draftId:next.id}).result;
  executeTool(state,"confirm_receipt",{token:preview.token,confirmed:true});
  const l=summary(state,order.id)[0]; assert.deepEqual([l.received,l.damaged,l.accepted,l.missing],[12,1,11,0]);
  assert.match(discrepancyReport(state,order.id),/12 received in total, including 1 damaged; 11 accepted; 0 still undelivered/);
});
test("reject invalid counts and foreign lines without changing a draft", () => {
  const {state,order,draft,record}=scenario();
  for(const [received,damaged] of [[-1,0],[1.5,0],[3,4],[1,-1],[100001,0]]) assert.throws(()=>record(received,damaged));
  assert.throws(()=>executeTool(state,"record_received_items",{draftId:draft.id,lineId:state.orders[1].lines[0].id,received:1,damaged:0}),/does not belong/);
  assert.equal(summary(state,order.id,draft)[0].received,0);
  assert.throws(()=>executeTool(state,"preview_receipt",{draftId:draft.id}),/at least one/);
});
test("guided input never guesses ambiguous or unsupported phrases", () => {
  for (const input of ["10 cases arrived, including 1 damaged","ten arrived, one of those damaged","10 received with 1 damaged"]) assert.deepEqual(parseReceivingText(input),{received:10,damaged:1});
  assert.deepEqual(parseReceivingText("12 arrived"),{received:12,damaged:0});
  for (const input of ["10 arrived and 1 damaged","not ten but twelve","1 arrived including 5 damaged","1.5 arrived"]) assert.ok("error" in parseReceivingText(input),input);
});
test("evidence must be verified by owner-scoped storage and invalidates review", () => {
  const {state,draft,record}=scenario(); record(1,0);
  executeTool(state,"preview_receipt",{draftId:draft.id});
  assert.throws(()=>executeTool(state,"attach_evidence",{draftId:draft.id,evidenceId:"foreign"}),/not found/);
  executeTool(state,"attach_evidence",{draftId:draft.id,evidenceId:"photo"},{evidence:{id:"photo",name:"case.jpg"}});
  assert.equal(draft.token,undefined); assert.equal(draft.evidence.length,1);
});
test("independent workspaces do not leak orders or draft operations", () => {
  const {state,order,draft}=scenario(); const other=emptyWorkspace();
  assert.throws(()=>executeTool(other,"start_receiving",{orderId:order.id}),/not found/);
  assert.throws(()=>executeTool(other,"preview_receipt",{draftId:draft.id}),/not found/);
  assert.equal(other.orders.length,0); assert.equal(state.orders.length,3);
});
test("overdeliveries are explicit rather than hidden as negative shortage", () => {
  const {state,order,draft,record}=scenario(); record(13,0); const line=summary(state,order.id,draft)[0];
  assert.equal(line.missing,0); assert.equal(line.excess,1);
});
test("multiple line quantities and units stay separate",()=>{
  const state=emptyWorkspace();
  const order=executeTool(state,"import_purchase_order",{reference:"TEST-1",supplier:"Test vendor",expected:"2026-10-16",lines:[{name:"Milk",ordered:12,unit:"cases"},{name:"Coffee",ordered:4,unit:"bags"}]}).result;
  const draft=executeTool(state,"start_receiving",{orderId:order.id}).result;
  executeTool(state,"record_received_items",{draftId:draft.id,lineId:order.lines[0].id,received:10,damaged:1});
  executeTool(state,"record_received_items",{draftId:draft.id,lineId:order.lines[1].id,received:4,damaged:0});
  assert.deepEqual(summary(state,order.id,draft).map(l=>[l.unit,l.accepted,l.missing]),[["cases",9,2],["bags",4,0]]);
});
test("fresh demo runs add new fictional orders without touching existing records", () => {
  const state = emptyWorkspace();
  executeTool(state, "load_demo_orders", {});
  const {result:draft} = executeTool(state, "start_receiving", { orderId: state.orders[0].id });
  executeTool(state, "record_received_items", { draftId: draft.id, lineId: state.orders[0].lines[0].id, received: 3, damaged: 0 });
  const before = structuredClone(state);
  const first = executeTool(state, "create_demo_order", { purpose: "recording" }).result;
  const second = executeTool(state, "create_demo_order", {}).result;
  assert.equal(first.reference, "DEMO-OAT-01"); assert.equal(second.reference, "DEMO-OAT-02");
  assert.ok(first.demo && first.demoKind === "recording" && /fictional/.test(first.supplier));
  assert.deepEqual([first.lines[0].ordered, first.lines[0].unit], [12, "cases"]);
  assert.deepEqual(state.orders.slice(0, 3), before.orders); assert.deepEqual(state.drafts, before.drafts); assert.deepEqual(state.receipts, before.receipts);
  const check = executeTool(state, "create_demo_order", { purpose: "protocol-check" }).result;
  assert.equal(check.reference, "DEMO-MCP-CHECK");
  assert.equal(executeTool(state, "create_demo_order", { purpose: "protocol-check" }).result.id, check.id, "protocol-check order is reused");
  assert.throws(() => executeTool(state, "create_demo_order", { purpose: "other" }));
  assert.throws(() => executeTool(state, "load_demo_orders", {}), /already loaded/);
  const fresh = emptyWorkspace(); executeTool(fresh, "create_demo_order", {});
  assert.equal(executeTool(fresh, "load_demo_orders", {}).workspace.orders.length, 4, "demo runs do not block the sample orders");
});
test("the recording story: 9 accepted, then a second good delivery, with damage kept as history", () => {
  const state = emptyWorkspace();
  const order = executeTool(state, "create_demo_order", {}).result; const line = order.lines[0].id;
  const confirm = (received, damaged) => {
    const draft = executeTool(state, "start_receiving", { orderId: order.id }).result;
    executeTool(state, "record_received_items", { draftId: draft.id, lineId: line, received, damaged });
    const { token } = executeTool(state, "preview_receipt", { draftId: draft.id }).result;
    return executeTool(state, "confirm_receipt", { token, confirmed: true }).result;
  };
  const r1 = confirm(10, 1);
  assert.deepEqual((({received,damaged,accepted,missing}) => [received,damaged,accepted,missing])(summary(state, order.id)[0]), [10,1,9,2]);
  const r2 = confirm(2, 0);
  assert.notEqual(r1.id, r2.id); assert.equal(state.receipts.filter(r => r.orderId === order.id).length, 2);
  const l = summary(state, order.id)[0];
  assert.deepEqual([l.received, l.damaged, l.accepted, l.missing], [12, 1, 11, 0]);
  // Everything was physically delivered, but not everything was accepted in good condition.
  assert.ok(l.accepted < l.ordered);
  const report = discrepancyReport(state, order.id);
  assert.match(report, /^Subject: Receiving discrepancy/); assert.match(report, /12 received in total, including 1 damaged; 11 accepted; 0 still undelivered/);
  assert.doesNotMatch(report, /All ordered quantities have been received and accepted/);
  assert.deepEqual(state.receipts[0].counts, r1.counts, "confirmed receipts are not rewritten by later deliveries");
});
test("a demo run can use the caller's local date and rejects malformed dates", () => {
  const state = emptyWorkspace();
  assert.equal(executeTool(state, "create_demo_order", { expected: "2026-10-17" }).result.expected, "2026-10-17");
  assert.throws(() => executeTool(state, "create_demo_order", { expected: "17/10/2026" }));
  assert.equal(state.orders.length, 1);
});
