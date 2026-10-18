const string = { type: "string" };
const quantity = { type: "integer", minimum: 0, maximum: 100000 };
const schema = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const tool = (name: string, description: string, inputSchema: object, readOnlyHint = false, idempotentHint = false) => ({ name, description, inputSchema, annotations: { readOnlyHint, destructiveHint: false, idempotentHint, openWorldHint: false } });
export const toolDefinitions = [
  tool("get_workspace", "List this user's purchase orders, receiving drafts, and confirmed receipts. Quantities received include damaged goods.", schema({}), true),
  tool("load_demo_orders", "Load three fictional purchase orders for a receiving demonstration, once per user. Call only when requested.", schema({})),
  tool("create_demo_order", "Add one fresh fictional demo purchase order without changing existing records. purpose \"recording\" adds 12 cases of oat milk with a new unique DEMO-OAT reference; \"protocol-check\" returns or creates the dedicated DEMO-MCP-CHECK order.", schema({ purpose: { type: "string", enum: ["recording", "protocol-check"] }, expected: { type: "string", description: "Optional expected date YYYY-MM-DD (the caller's local date); defaults to today in UTC." } }, [])),
  tool("import_purchase_order", "Create a purchase order from the user's supplied data. Do not infer ordered quantities.", schema({ reference: string, supplier: string, expected: { type: "string", description: "YYYY-MM-DD" }, lines: { type: "array", minItems: 1, maxItems: 30, items: schema({ name: string, sku: string, ordered: { ...quantity, minimum: 1 }, unit: string }, ["name", "ordered", "unit"]) } })),
  tool("start_receiving", "Open or resume a receiving draft for an order. A new draft after confirmation represents a separate physical delivery.", schema({ orderId: string }), false, true),
  tool("record_received_items", "Set (do not increment) the quantity for a draft line. received is the TOTAL delivered including damaged. Ask for clarification if inclusion is ambiguous. Does not confirm receipt.", schema({ draftId: string, lineId: string, received: quantity, damaged: quantity }), false, true),
  tool("update_receiving_note", "Set a note on a receiving draft. Does not confirm it.", schema({ draftId: string, note: string }), false, true),
  tool("attach_evidence", "Attach an existing photo owned by this user to a draft. Upload photos in the ReceiveRight web interface.", schema({ draftId: string, evidenceId: string }), false, true),
  tool("preview_receipt", "Prepare an up-to-date review and confirmation token. Show the user the received, damaged, accepted and undelivered quantities before asking for explicit confirmation.", schema({ draftId: string })),
  tool("confirm_receipt", "Save an immutable receiving receipt. ONLY call after showing preview_receipt to the user and getting explicit confirmation for those exact counts. Use that preview's token. Retrying the same token does not duplicate a receipt.", schema({ token: string, confirmed: { const: true, type: "boolean" } }), false, true),
  tool("draft_discrepancy_report", "Generate a supplier message draft from confirmed receipts. This does not send any message.", schema({ orderId: string }), true),
];
