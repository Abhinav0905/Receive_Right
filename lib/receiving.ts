import { z } from "zod";

export type OrderLine = { id: string; name: string; sku: string; ordered: number; unit: string };
// demo marks fictional data. demoKind marks orders made by create_demo_order (recording runs and the MCP protocol check).
export type Order = { id: string; reference: string; supplier: string; expected: string; lines: OrderLine[]; demo?: boolean; demoKind?: DemoKind };
export type DemoKind = "recording" | "protocol-check";
export type Count = { lineId: string; received: number; damaged: number };
export type Evidence = { id: string; name: string };
export type Draft = { id: string; orderId: string; counts: Count[]; note: string; evidence: Evidence[]; token?: string };
export type Receipt = Omit<Draft, "token"> & { confirmedAt: string; confirmationToken: string };
export type Workspace = { orders: Order[]; drafts: Draft[]; receipts: Receipt[] };
export type LineSummary = OrderLine & { received: number; damaged: number; accepted: number; missing: number; excess: number };
export const emptyWorkspace = (): Workspace => ({ orders: [], drafts: [], receipts: [] });
const qty = z.number().int().min(0).max(100000);
const id = z.string().min(1).max(100);
const schemas = {
  get_workspace: z.object({}),
  load_demo_orders: z.object({}),
  create_demo_order: z.object({ purpose: z.enum(["recording", "protocol-check"]).default("recording"), expected: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  import_purchase_order: z.object({
    reference: z.string().trim().min(1).max(60), supplier: z.string().trim().min(1).max(100),
    expected: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lines: z.array(z.object({ name: z.string().trim().min(1).max(120), sku: z.string().max(60).default(""), ordered: qty.refine(n => n > 0), unit: z.string().trim().min(1).max(30) })).min(1).max(30),
  }),
  start_receiving: z.object({ orderId: id }),
  record_received_items: z.object({ draftId: id, lineId: id, received: qty, damaged: qty }),
  update_receiving_note: z.object({ draftId: id, note: z.string().max(2000) }),
  attach_evidence: z.object({ draftId: id, evidenceId: id }),
  preview_receipt: z.object({ draftId: id }),
  confirm_receipt: z.object({ token: id, confirmed: z.literal(true) }),
  draft_discrepancy_report: z.object({ orderId: id }),
};
export type ToolName = keyof typeof schemas;
type CommandArgs = { orderId: string; draftId: string; lineId: string; received: number; damaged: number; note: string; evidenceId: string; token: string; confirmed: true; purpose: DemoKind; reference: string; supplier: string; expected: string; lines: Omit<OrderLine, "id">[] };
export const readOnlyTools = new Set<ToolName>(["get_workspace", "draft_discrepancy_report"]);
export function summary(state: Workspace, orderId: string, draft?: Draft): LineSummary[] {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) throw new Error("Purchase order not found.");
  const counts = [...state.receipts.filter(r => r.orderId === orderId).flatMap(r => r.counts), ...(draft?.counts ?? [])];
  return order.lines.map(line => {
    const matching = counts.filter(c => c.lineId === line.id);
    const received = matching.reduce((n, c) => n + c.received, 0);
    const damaged = matching.reduce((n, c) => n + c.damaged, 0);
    return { ...line, received, damaged, accepted: received - damaged, missing: Math.max(0, line.ordered - received), excess: Math.max(0, received - line.ordered) };
  });
}
export function discrepancyReport(state: Workspace, orderId: string): string {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) throw new Error("Purchase order not found.");
  const receipts = state.receipts.filter(r => r.orderId === orderId);
  if (!receipts.length) throw new Error("Confirm a receipt before preparing a supplier report.");
  const lines = summary(state, orderId);
  const issues = lines.filter(l => l.missing || l.damaged || l.excess);
  return [
    `Subject: Receiving ${issues.length ? "discrepancy" : "confirmation"} — ${order.reference}`,
    "", `Hello ${order.supplier},`, "", `We have recorded ${receipts.length} delivery receipt(s) against ${order.reference}.`, "",
    ...lines.map(l => `${l.name} (${l.sku || "no SKU"}): ${l.ordered} ${l.unit} ordered; ${l.received} received in total, including ${l.damaged} damaged; ${l.accepted} accepted; ${l.missing} still undelivered${l.excess ? `; ${l.excess} over ordered quantity` : ""}.`),
    "", issues.length ? "Please review the discrepancies and confirm the next steps for the undelivered and/or damaged goods." : "All ordered quantities have been received and accepted.",
    "", ...receipts.filter(r => r.note).map(r => `Receiving note: ${r.note}`),
    `Evidence on file: ${receipts.reduce((n, r) => n + r.evidence.length, 0)} attachment(s).`,
    "", "Thank you.", "", "DRAFT — review before sending. No message has been sent.",
  ].join("\n");
}

// Pure operations: storage commits these changes with a compare-and-swap revision.
export function executeTool(state: Workspace, name: string, raw: unknown, context: { evidence?: Evidence; uuid?: () => string; now?: () => string } = {}) {
  if (!(name in schemas)) throw new Error("Unknown tool.");
  const uuid = context.uuid ?? (() => crypto.randomUUID());
  const now = context.now ?? (() => new Date().toISOString());
  // Each operation is runtime-validated against its dedicated schema above.
  const args = schemas[name as ToolName].parse(raw ?? {}) as CommandArgs;
  const draftFor = (draftId: string) => {
    const draft = state.drafts.find(d => d.id === draftId);
    if (!draft) throw new Error("Receiving draft not found. Refresh and try again.");
    return draft;
  };
  let result: unknown = null;
  switch (name as ToolName) {
    case "get_workspace": break;
    case "load_demo_orders": {
      if (state.orders.some(o => o.demo && !o.demoKind)) throw new Error("The sample orders are already loaded.");
      const expected = now().slice(0, 10);
      state.orders.push(
        { id: uuid(), reference: "PO-1042", supplier: "Northstar Supply Co.", expected, demo: true, lines: [{ id: uuid(), name: "Oat milk · Barista blend", sku: "OM-BAR-06", ordered: 12, unit: "cases" }] },
        { id: uuid(), reference: "PO-1043", supplier: "Fieldwork Coffee", expected, demo: true, lines: [{ id: uuid(), name: "House blend · Whole bean", sku: "FW-HB-1K", ordered: 8, unit: "bags" }] },
        { id: uuid(), reference: "PO-1044", supplier: "Good Paper Goods", expected, demo: true, lines: [{ id: uuid(), name: "Compostable takeaway cups", sku: "GP-CUP-12", ordered: 6, unit: "cartons" }] },
      );
      break;
    }
    case "create_demo_order": {
      // Adds fictional data only. Existing orders, drafts and receipts are never changed.
      if (args.purpose === "protocol-check") {
        const existing = state.orders.find(o => o.demoKind === "protocol-check");
        if (existing) { result = existing; break; }
      }
      if (state.orders.length >= 100) throw new Error("This prototype supports up to 100 orders.");
      const taken = new Set(state.orders.map(o => o.reference.toLowerCase()));
      let reference = "DEMO-MCP-CHECK";
      for (let n = 2; taken.has(reference.toLowerCase()); n++) reference = `DEMO-MCP-CHECK-${n}`;
      if (args.purpose === "recording") {
        let n = state.orders.filter(o => o.demoKind === "recording").length + 1;
        while (taken.has(`demo-oat-${String(n).padStart(2, "0")}`)) n++;
        reference = `DEMO-OAT-${String(n).padStart(2, "0")}`;
      }
      const order: Order = args.purpose === "recording"
        ? { id: uuid(), reference, supplier: "Northstar Supply Co. (fictional demo)", expected: args.expected ?? now().slice(0, 10), demo: true, demoKind: "recording", lines: [{ id: uuid(), name: "Oat milk · Barista blend", sku: "OM-BAR-06", ordered: 12, unit: "cases" }] }
        : { id: uuid(), reference, supplier: "MCP protocol check (fictional)", expected: args.expected ?? now().slice(0, 10), demo: true, demoKind: "protocol-check", lines: [{ id: uuid(), name: "Protocol check · paper cups", sku: "MCP-CUP-04", ordered: 4, unit: "cartons" }] };
      state.orders.push(order); result = order; break;
    }
    case "import_purchase_order": {
      if (state.orders.length >= 100) throw new Error("This prototype supports up to 100 orders.");
      if (state.orders.some(o => o.reference.toLowerCase() === args.reference.toLowerCase())) throw new Error("An order with this reference already exists.");
      const order: Order = { id: uuid(), reference: args.reference, supplier: args.supplier, expected: args.expected, lines: args.lines.map(l => ({ ...l, id: uuid() })) };
      state.orders.push(order); result = order; break;
    }
    case "start_receiving": {
      const order = state.orders.find(o => o.id === args.orderId);
      if (!order) throw new Error("Purchase order not found.");
      let draft = state.drafts.find(d => d.orderId === order.id);
      if (!draft) {
        draft = { id: uuid(), orderId: order.id, counts: order.lines.map(l => ({ lineId: l.id, received: 0, damaged: 0 })), evidence: [], note: "" };
        state.drafts.push(draft);
      }
      result = draft; break;
    }
    case "record_received_items": {
      const draft = draftFor(args.draftId);
      const count = draft.counts.find(c => c.lineId === args.lineId);
      if (!count) throw new Error("This item does not belong to the receiving draft.");
      if (args.damaged > args.received) throw new Error("Damaged goods are included in received goods. Damage cannot exceed the quantity received.");
      count.received = args.received; count.damaged = args.damaged;
      delete draft.token; result = draft; break;
    }
    case "update_receiving_note": {
      const draft = draftFor(args.draftId); draft.note = args.note; delete draft.token; result = draft; break;
    }
    case "attach_evidence": {
      const draft = draftFor(args.draftId);
      if (!context.evidence || context.evidence.id !== args.evidenceId) throw new Error("Evidence not found.");
      if (!draft.evidence.some(e => e.id === args.evidenceId)) {
        if (draft.evidence.length >= 5) throw new Error("Attach up to five photos per receipt.");
        draft.evidence.push(context.evidence); delete draft.token;
      }
      result = draft; break;
    }
    case "preview_receipt": {
      const draft = draftFor(args.draftId);
      if (!draft.counts.some(c => c.received > 0)) throw new Error("Enter at least one received item before review.");
      draft.token = uuid(); result = { token: draft.token, draft, totals: summary(state, draft.orderId, draft) }; break;
    }
    case "confirm_receipt": {
      const existing = state.receipts.find(r => r.confirmationToken === args.token);
      if (existing) { result = existing; break; }
      const draft = state.drafts.find(d => d.token === args.token);
      if (!draft) throw new Error("This review is out of date. Review the latest quantities before confirming.");
      if (state.receipts.length >= 500) throw new Error("This prototype supports up to 500 receipts.");
      const { token, ...content } = draft;
      const receipt = { ...content, confirmationToken: token!, confirmedAt: now() };
      state.receipts.push(receipt); state.drafts = state.drafts.filter(d => d.id !== draft.id); result = receipt; break;
    }
    case "draft_discrepancy_report": result = { text: discrepancyReport(state, args.orderId) }; break;
  }
  return { workspace: state, result };
}

// Deliberately narrow grammar. Unknown or ambiguous phrases never change counts.
export function parseReceivingText(input: string): { received: number; damaged: number } | { error: string } {
  const words: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
  const text = input.toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g, w => String(words[w])).replace(/[,.!?]/g, " ").replace(/\s+/g, " ").trim();
  const match = /^(?:received )?(\d+) (?:cases? |bags? |cartons? |items? |units? )?(?:(?:arrived|received|delivered) ?)?(?:[, ]*(?:including|with|and)? ?(\d+) (?:of (?:those|them) (?:is |are )?)?(?:damaged|broken))?$/.exec(text);
  if (!match || /\band\b/.test(text)) return { error: 'Try “10 cases arrived, including 1 damaged.” The damaged quantity must be part of the total received.' };
  const received = Number(match[1]);
  const damaged = Number(match[2] ?? 0);
  if (damaged > received || received > 100000) return { error: "Check the quantities. Damaged items must be included in the received total." };
  return { received, damaged };
}
