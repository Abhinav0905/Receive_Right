// Opt-in LIVE check of the conversational assistant against Amazon Bedrock.
// Runs the real agent loop (lib/receiving-agent.ts) and Bedrock adapter (lib/bedrock.ts) on isolated
// in-memory workspaces: it never reads or writes your local database. Each scenario makes 1-8 model calls
// and may incur AWS charges. Credentials are read from .env and never printed.
//
// Usage: pnpm check:bedrock-live                 every scenario once
//        pnpm check:bedrock-live -- 3 4 S3       3 repetitions, 4 at a time, only scenarios starting with S3
// Results are written to .live-check/bedrock-<timestamp>.json (ignored by git). Fixture tests do not prove live access; this does,
// for the moment it runs.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const cli = process.argv.slice(2).filter(a => a !== "--");
const [repsArg = "1", concArg = "3", filter = ""] = cli;
mkdirSync(`${root}/.live-check`, { recursive: true });
const outPath = `${root}/.live-check/bedrock-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const lib = p => pathToFileURL(`${root}/lib/${p}`).href;
const { emptyWorkspace, executeTool } = await import(lib("receiving.ts"));
const { runReceivingAgent } = await import(lib("receiving-agent.ts"));
const { createBedrockModel } = await import(lib("bedrock.ts"));

const env = {};
for (const line of readFileSync(`${root}/.env`, "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const bedrockEnv = { AWS_REGION: env.AWS_REGION, BEDROCK_MODEL_ID: env.BEDROCK_MODEL_ID, AWS_BEARER_TOKEN_BEDROCK: env.AWS_BEARER_TOKEN_BEDROCK };
const secret = bedrockEnv.AWS_BEARER_TOKEN_BEDROCK;

// Wrap fetch to record per-call usage/latency/stopReason/block kinds without exposing headers.
function recordingFetch(calls) {
  return async (url, options) => {
    const started = Date.now();
    const response = await fetch(url, options);
    const text = await response.text();
    const entry = { status: response.status, ms: Date.now() - started };
    if (response.ok) {
      try {
        const data = JSON.parse(text);
        entry.stopReason = data.stopReason;
        entry.usage = data.usage && { in: data.usage.inputTokens, out: data.usage.outputTokens };
        entry.blocks = (data.output?.message?.content ?? []).map(b => Object.keys(b)[0]);
        entry.toolUses = (data.output?.message?.content ?? []).filter(b => b.toolUse).map(b => ({ name: b.toolUse.name, input: b.toolUse.input }));
      } catch { entry.parse = "failed"; }
    } else {
      try { entry.error = (JSON.parse(text).message ?? "").replace(/\b\d{12}\b/g, "<acct>").slice(0, 300); } catch { entry.error = "unparseable"; }
    }
    calls.push(entry);
    return new Response(text, { status: response.status, headers: response.headers });
  };
}

const ids = (() => { let n = 0; return () => `id-${++n}`; })();
const ctx = { uuid: ids, now: () => "2026-10-17T07:00:00.000Z" };
const run = (state, name, args) => executeTool(state, name, args, ctx).result;
function base() {
  const state = emptyWorkspace();
  run(state, "load_demo_orders", {});
  run(state, "import_purchase_order", { reference: "PO-2001", supplier: "Valley Dairy", expected: "2026-10-17", lines: [
    { name: "Whole milk · 1 gal", sku: "VD-WM-1G", ordered: 6, unit: "cases" },
    { name: "Oat milk · Barista blend", sku: "VD-OAT-B", ordered: 4, unit: "cases" },
    { name: "Almond milk · Barista blend", sku: "VD-ALM-B", ordered: 4, unit: "cases" },
  ] });
  const by = ref => state.orders.find(o => o.reference === ref);
  return { state, po42: by("PO-1042"), po43: by("PO-1043"), po2001: by("PO-2001") };
}
function confirmDelivery(state, order, counts) {
  const draft = run(state, "start_receiving", { orderId: order.id });
  for (const [lineIndex, received, damaged] of counts) run(state, "record_received_items", { draftId: draft.id, lineId: order.lines[lineIndex].id, received, damaged });
  const preview = run(state, "preview_receipt", { draftId: draft.id });
  run(state, "confirm_receipt", { token: preview.token, confirmed: true });
}
function seedDraft(state, order, counts) {
  const draft = run(state, "start_receiving", { orderId: order.id });
  for (const [lineIndex, received, damaged] of counts) run(state, "record_received_items", { draftId: draft.id, lineId: order.lines[lineIndex].id, received, damaged });
  return run(state, "preview_receipt", { draftId: draft.id }).token;
}

const draftOf = (state, order) => state.drafts.find(d => d.orderId === order.id);
const countsOf = (state, order) => { const d = draftOf(state, order); return d ? order.lines.map(l => { const c = d.counts.find(x => x.lineId === l.id); return [c.received, c.damaged]; }) : null; };
const anyReceived = (state, order) => (draftOf(state, order)?.counts ?? []).some(c => c.received > 0);
const receiptsOf = (state, order) => state.receipts.filter(r => r.orderId === order.id).length;
const asks = reply => /\?/.test(reply);

// Each scenario: setup() -> {state, order, ...}; turns: [{text, check(result, before, s) -> [ [label, bool], ... ]}]
const scenarios = [
  { id: "S1-status-question", desc: "Informational question must not change anything (PO-1043 with 1 of 8 confirmed)",
    setup() { const s = base(); confirmDelivery(s.state, s.po43, [[0, 1, 0]]); return { ...s, order: s.po43 }; },
    turns: [{ text: "What is still outstanding?", check: (r, before, s) => [
      ["no workspace change committed (changed=false)", r.changed === false],
      ["no draft created", !draftOf(r.workspace, s.order)],
      ["reply mentions 7 outstanding", /\b7\b|seven/i.test(r.reply)],
      ["no review token produced", r.review === null],
    ] }] },
  { id: "S2-rest-arrived", desc: "'The rest arrived' is not a count: ask for count+condition (PO-1043 with 1 confirmed)",
    setup() { const s = base(); confirmDelivery(s.state, s.po43, [[0, 1, 0]]); return { ...s, order: s.po43 }; },
    turns: [{ text: "The rest arrived.", check: (r, before, s) => [
      ["no received quantities recorded", !anyReceived(r.workspace, s.order)],
      ["asks a question", asks(r.reply)],
      ["mentions 7 outstanding", /\b7\b|seven/i.test(r.reply)],
      ["receipts unchanged (1)", receiptsOf(r.workspace, s.order) === 1],
    ] }] },
  { id: "S3-ambiguous-damage", desc: "'Ten arrived and one was damaged' -> clarify inclusion, then record 10/1 (PO-1042)",
    setup() { const s = base(); return { ...s, order: s.po42 }; },
    turns: [
      { text: "Ten arrived and one was damaged.", check: (r, before, s) => [
        ["no received quantities recorded before clarification", !anyReceived(r.workspace, s.order)],
        ["asks a question", asks(r.reply)],
        ["asks about inclusion", /includ|among|part of|out of|of those|of the (ten|10)|total/i.test(r.reply)],
      ] },
      { text: "Ten total, including the damaged one.", check: (r, before, s) => [
        ["draft counts 10 received / 1 damaged", JSON.stringify(countsOf(r.workspace, s.order)) === "[[10,1]]"],
        ["review prepared", !!r.review],
        ["review totals: 9 accepted, 1 damaged, 2 undelivered", !!r.review && r.review.totals[0].accepted === 9 && r.review.totals[0].damaged === 1 && r.review.totals[0].missing === 2],
        ["no receipt confirmed", receiptsOf(r.workspace, s.order) === 0],
      ] },
    ] },
  { id: "S4-clear-shortage-damage", desc: "'10 cases arrived, including 1 damaged' -> 10/1, review 9/1/2 (PO-1042)",
    setup() { const s = base(); return { ...s, order: s.po42 }; },
    turns: [{ text: "10 cases arrived, including 1 damaged.", check: (r, before, s) => [
      ["draft counts 10/1", JSON.stringify(countsOf(r.workspace, s.order)) === "[[10,1]]"],
      ["review prepared", !!r.review],
      ["review totals 9 accepted / 1 damaged / 2 undelivered", !!r.review && r.review.totals[0].accepted === 9 && r.review.totals[0].damaged === 1 && r.review.totals[0].missing === 2],
      ["no receipt confirmed", receiptsOf(r.workspace, s.order) === 0],
      ["reply does not claim it is confirmed/saved", !/\b(receipt|it|delivery) (has been|is now|was) (confirmed|saved)\b/i.test(r.reply)],
    ] }] },
  { id: "S5-correction", desc: "Correct a previewed 10/1 draft to 9/1 before confirmation; old token invalidated (PO-1042)",
    setup() { const s = base(); const oldToken = seedDraft(s.state, s.po42, [[0, 10, 1]]); return { ...s, order: s.po42, oldToken }; },
    turns: [{ text: "Correction: only 9 cases arrived, and 1 of those 9 was damaged.", check: (r, before, s) => [
      ["draft counts 9/1", JSON.stringify(countsOf(r.workspace, s.order)) === "[[9,1]]"],
      ["old review token invalidated", draftOf(r.workspace, s.order)?.token !== s.oldToken],
      ["fresh review: 8 accepted, 3 undelivered", !!r.review && r.review.totals[0].accepted === 8 && r.review.totals[0].missing === 3],
      ["old token can no longer confirm", (() => { try { executeTool(structuredClone(r.workspace), "confirm_receipt", { token: s.oldToken, confirmed: true }); return false; } catch { return true; } })()],
      ["still a single draft (no duplicate delivery)", r.workspace.drafts.filter(d => d.orderId === s.order.id).length === 1],
    ] }] },
  { id: "S6-confirm-request", desc: "User asks the assistant to confirm: it cannot; points to Review/Confirm (PO-1042, previewed draft)",
    setup() { const s = base(); seedDraft(s.state, s.po42, [[0, 10, 1]]); return { ...s, order: s.po42 }; },
    turns: [{ text: "That's right. Confirm and save the receipt for me now, skip the review.", check: (r, before, s) => [
      ["no receipt created", receiptsOf(r.workspace, s.order) === 0],
      ["draft counts unchanged 10/1", JSON.stringify(countsOf(r.workspace, s.order)) === "[[10,1]]"],
      ["reply points the user to Review receipt / Confirm & save", /review receipt|confirm (&|and) save/i.test(r.reply)],
      ["reply does not claim the receipt was confirmed", !/\b(receipt|it|delivery) (has been|is now|was) (confirmed|saved)\b/i.test(r.reply)],
    ] }] },
  { id: "S7-second-delivery", desc: "After confirming 10/1, a second delivery of 2 good cases -> 12 received, 11 accepted, 1 damaged, 0 undelivered (PO-1042)",
    setup() { const s = base(); confirmDelivery(s.state, s.po42, [[0, 10, 1]]); return { ...s, order: s.po42 }; },
    turns: [{ text: "The second delivery just came: 2 cases, both in good condition, none damaged.", check: (r, before, s) => [
      ["new draft counts 2/0", JSON.stringify(countsOf(r.workspace, s.order)) === "[[2,0]]"],
      ["review totals: 12 received, 11 accepted, 1 damaged, 0 undelivered", !!r.review && r.review.totals[0].received === 12 && r.review.totals[0].accepted === 11 && r.review.totals[0].damaged === 1 && r.review.totals[0].missing === 0],
      ["first receipt untouched (still 1 receipt, 10/1)", receiptsOf(r.workspace, s.order) === 1 && r.workspace.receipts[0].counts[0].received === 10 && r.workspace.receipts[0].counts[0].damaged === 1],
    ] }] },
  { id: "S11-confirm-between-turns", desc: "Same conversation: assistant drafts 10/1, the person confirms in the UI, then a second delivery of 2 (PO-1042)",
    setup() { const s = base(); return { ...s, order: s.po42 }; },
    turns: [
      { text: "10 cases arrived, including 1 damaged.", check: (r, before, s) => [
        ["draft counts 10/1", JSON.stringify(countsOf(r.workspace, s.order)) === "[[10,1]]"],
      ] },
      { before: (state, s) => { const d = draftOf(state, s.order); const p = run(state, "preview_receipt", { draftId: d.id }); run(state, "confirm_receipt", { token: p.token, confirmed: true }); },
        text: "A second delivery just came: 2 more cases, both in good condition.", check: (r, before, s) => [
        ["new draft counts 2/0", JSON.stringify(countsOf(r.workspace, s.order)) === "[[2,0]]"],
        ["review totals 11 accepted / 1 damaged / 0 undelivered", !!r.review && r.review.totals[0].accepted === 11 && r.review.totals[0].damaged === 1 && r.review.totals[0].missing === 0],
        ["does not retract or doubt its earlier (now confirmed) draft", !/correct my (last|previous|earlier)|hadn.t actually|did(n.t| not) actually|my (mistake|error)|I was wrong|apolog|same 10|separate one/i.test(r.reply)],
      ] },
    ] },
  { id: "S8-multiline-ambiguous", desc: "Multi-line PO: 'barista milk' matches two lines -> ask which; then record oat 4/0 only (PO-2001)",
    setup() { const s = base(); return { ...s, order: s.po2001 }; },
    turns: [
      { text: "4 cases of the barista milk arrived, no damage.", check: (r, before, s) => [
        ["no quantities recorded before clarification", !anyReceived(r.workspace, s.order)],
        ["asks which item", asks(r.reply) && /oat|almond|which/i.test(r.reply)],
      ] },
      { text: "The oat milk.", check: (r, before, s) => [
        ["only the oat line set to 4/0", JSON.stringify(countsOf(r.workspace, s.order)) === "[[0,0],[4,0],[0,0]]"],
        ["review prepared", !!r.review],
        ["review: oat 4 accepted 0 undelivered; whole 6 undelivered; almond 4 undelivered", !!r.review && r.review.totals[1].accepted === 4 && r.review.totals[1].missing === 0 && r.review.totals[0].missing === 6 && r.review.totals[2].missing === 4],
      ] },
    ] },
  { id: "S9-multiline-clear", desc: "Multi-line delivery in one message (PO-2001): whole 6 incl 2 damaged, almond 4 good",
    setup() { const s = base(); return { ...s, order: s.po2001 }; },
    turns: [{ text: "6 cases of whole milk arrived, and 2 of those 6 were damaged. Also 4 cases of almond milk, all in good condition. No oat milk came.", check: (r, before, s) => [
      ["counts whole 6/2, oat 0/0, almond 4/0", JSON.stringify(countsOf(r.workspace, s.order)) === "[[6,2],[0,0],[4,0]]"],
      ["review prepared", !!r.review],
      ["review: whole 4 accepted/2 damaged/0 undelivered; oat 4 undelivered; almond 4 accepted", !!r.review && r.review.totals[0].accepted === 4 && r.review.totals[0].damaged === 2 && r.review.totals[0].missing === 0 && r.review.totals[1].missing === 4 && r.review.totals[2].accepted === 4],
    ] }] },
  { id: "S10-unit-conversion", desc: "Order is in bags; user reports cases with no conversion -> ask, do not convert (PO-1043)",
    setup() { const s = base(); return { ...s, order: s.po43 }; },
    turns: [{ text: "Two cases of the house blend arrived.", check: (r, before, s) => [
      ["no quantities recorded", !anyReceived(r.workspace, s.order)],
      ["asks a question", asks(r.reply)],
      ["asks about bags/conversion", /bag/i.test(r.reply)],
    ] }] },
];

async function runScenario(sc, rep) {
  const s = sc.setup();
  let state = s.state;
  const messages = [];
  const turns = [];
  for (const turn of sc.turns) {
    if (turn.before) turn.before(state, s);
    messages.push({ role: "user", text: turn.text });
    const calls = [];
    const model = createBedrockModel(bedrockEnv, recordingFetch(calls));
    const before = structuredClone(state);
    const started = Date.now();
    let result, error = null;
    try { result = await runReceivingAgent(state, { orderId: s.order.id, messages: structuredClone(messages) }, model); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    const record = { user: turn.text, ms: Date.now() - started, calls, error };
    if (result) {
      // The real route commits only when changed; mirror that.
      if (result.changed) state = result.workspace;
      record.reply = result.reply; record.trace = result.trace; record.changed = result.changed;
      record.review = result.review ? { counts: result.review.draft.counts, totals: result.review.totals.map(t => ({ name: t.name, ordered: t.ordered, received: t.received, damaged: t.damaged, accepted: t.accepted, missing: t.missing, excess: t.excess })) } : null;
      record.draftCounts = countsOf(state, s.order);
      record.receipts = receiptsOf(state, s.order);
      record.checks = turn.check({ ...result, workspace: state }, before, s).map(([label, pass]) => ({ label, pass: !!pass }));
      messages.push({ role: "assistant", text: result.reply });
    } else {
      record.checks = [{ label: "turn completed without error", pass: false }];
      turns.push(record);
      break;
    }
    turns.push(record);
  }
  const pass = turns.every(t => t.checks.every(c => c.pass)) && turns.length === sc.turns.length;
  return { id: sc.id, desc: sc.desc, rep, pass, turns };
}

const reps = Number(repsArg), concurrency = Number(concArg);
const jobs = [];
for (const sc of scenarios.filter(s => !filter || s.id.startsWith(filter))) for (let rep = 1; rep <= reps; rep++) jobs.push([sc, rep]);
const results = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
  while (next < jobs.length) {
    const [sc, rep] = jobs[next++];
    const r = await runScenario(sc, rep);
    results.push(r);
    console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id} #${r.rep} (${r.turns.reduce((n, t) => n + t.calls.length, 0)} model calls)`);
  }
}));
results.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }) || a.rep - b.rep);
const out = JSON.stringify({ model: bedrockEnv.BEDROCK_MODEL_ID, region: bedrockEnv.AWS_REGION, reps, results }, null, 1);
if (secret && out.includes(secret)) throw new Error("refusing to write a report containing the credential");
writeFileSync(outPath, out);
const calls = results.flatMap(r => r.turns.flatMap(t => t.calls));
const tokensIn = calls.reduce((n, c) => n + (c.usage?.in ?? 0), 0), tokensOut = calls.reduce((n, c) => n + (c.usage?.out ?? 0), 0);
console.log(`\n${results.filter(r => r.pass).length}/${results.length} scenario runs passed; ${calls.length} model calls; ${tokensIn} input / ${tokensOut} output tokens; non-200 calls: ${calls.filter(c => c.status !== 200).length}`);
for (const sc of scenarios.filter(s => !filter || s.id.startsWith(filter))) {
  const rs = results.filter(r => r.id === sc.id);
  console.log(`  ${sc.id}: ${rs.filter(r => r.pass).length}/${rs.length}`);
  for (const r of rs) for (const [i, t] of r.turns.entries()) for (const c of t.checks) if (!c.pass) console.log(`     #${r.rep} turn ${i + 1} FAILED: ${c.label}${t.error ? ` [error: ${t.error}]` : ""}`);
}
console.log(`\nReport (fictional data, no credentials): ${outPath.replace(`${root}/`, "")}`);
process.exitCode = results.every(r => r.pass) ? 0 : 1;
