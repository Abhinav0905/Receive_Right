# ReceiveRight · product behavior, architecture and limits

Voice-first receiving for small businesses. The demo scenario is a café checking a supplier delivery: 12 cases ordered, 10 delivered, one of those damaged. The correct result is **9 accepted, 1 damaged, 2 undelivered**. When the last 2 arrive in good condition, a second receipt brings the order to **12 received, 11 accepted, 1 damaged (kept on record), 0 undelivered**.

## Try the demo

Follow [README.md](README.md) to run locally and sign in with the development identity. Then click **New demo run** for a fresh fictional order (`DEMO-OAT-NN`, 12 cases of oat milk) and follow the README walkthrough. The recording script is [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Implemented

- Purchase order creation and JSON import, including multiple line items and distinct units.
- Repeatable demo runs: each click adds a new fictional order with a unique `DEMO-OAT-NN` reference; nothing existing is reset. Receipt history can focus on one order.
- Conversational assistant (Amazon Bedrock Converse with tool use) with an action trace, shared configuration/connection status and an explicit connection test.
- Browser dictation in both voice entry points: continuous recognition with interim results, one shared transcript assembler, explicit stop/resume, read-only text while listening, guidance for unsupported browsers, denied microphones, silence and network errors. It never submits anything.
- Guided input with a deliberately narrow phrase parser (no AI) and a count table.
- Draft editing, evidence photos, notes, explicit review and confirmation.
- Server-side quantity validation: whole, non-negative counts; damage is a subset of received.
- Owner-scoped D1 persistence with compare-and-swap revisions; assistant turns are staged and committed atomically.
- Review tokens are invalidated by edits; retrying a successful token returns the existing receipt.
- Later deliveries add to the same purchase order as new receipts; confirmed receipts are immutable.
- Private R2 photo storage with owner-checked reads.
- Receipt export and editable supplier report drafts (never sent).
- A stateless JSON-RPC MCP endpoint at `/mcp` (Streamable HTTP) and an in-app MCP client that verifies it with real HTTP requests.

## Architecture

```text
Browser dictation (Web Speech API, browser service) ──> editable text (never auto-submitted)
                                                              │ Send
                                                              ▼
POST /api/assistant  (website session + origin check)
  └─ lib/receiving-agent.ts  bounded loop: ≤ 6 model calls, ≤ 12 tool calls, 55 s
       ├─ Amazon Bedrock Converse API (server-side API key; tool use; Claude Haiku 5.5 via us. inference profile)
       └─ validated receiving operations (lib/receiving.ts) on a staged copy of the workspace
  └─ lib/store.ts  one atomic commit with revision check (D1)   ← provider failure / concurrent edit = nothing saved
                                                              ▼
Draft + review in the UI ──> person clicks "Confirm & save receipt" ──> immutable receipt (D1)

Separate MCP path:
MCP client (in-app panel · pnpm mcp:smoke · MCP agent clients)
  └─ POST /mcp  Streamable HTTP, JSON responses, protocol 2025-11-25
       └─ the same validated receiving operations and owner-scoped storage
```

The Bedrock assistant does **not** travel through MCP. It calls the same domain operations in-process through `/api/assistant`. The MCP endpoint is a separate, real HTTP path; the in-app panel and `pnpm mcp:smoke` prove it with actual requests.

### What the assistant may do

`get_workspace` (selected order only), `start_receiving`, `record_received_items` (sets this delivery's counts), `update_receiving_note`, `preview_receipt`, `draft_discrepancy_report`. It cannot confirm receipts, import or create orders, attach photos, read other orders or send messages. Review tokens and photo contents never enter model context. Arithmetic and authorization are enforced in code, not by the prompt. An informational turn writes nothing; a draft the model opens but leaves empty is discarded.

### MCP tools

`get_workspace`, `load_demo_orders`, `create_demo_order`, `import_purchase_order`, `start_receiving`, `record_received_items`, `update_receiving_note`, `attach_evidence`, `preview_receipt`, `confirm_receipt`, `draft_discrepancy_report`. `confirm_receipt` exists for MCP clients that show the exact review to a person and obtain explicit confirmation (that approval happens in the MCP host, not in this server); the browser's MCP check never calls it.

Protocol notes: `initialize` negotiates `2025-11-25`. `server/discover` also lists `2026-07-28` for the hosting platform's discovery, but the server does not implement that revision. Requests need a string or number id; protocol errors return HTTP 400 with a JSON-RPC error body; tool failures return `isError: true`. Stored review tokens are withheld from MCP tool output; a client gets a token only from its own `preview_receipt`, so it cannot confirm a draft that a person reviewed elsewhere.

## Authentication and hosting

- Hosted (Sites): the Worker trusts identity headers injected by the Sites gateway. The browser uses `/api/receiving` and `/api/assistant` with the website session. `/mcp` is authenticated by the gateway's connector flow, so the browser MCP panel may receive 401 there; this is documented, not bypassed.
- Local (`pnpm dev`): a loopback-only development sign-in sets a cookie for a fictional user; the dev server then adds the identity headers for loopback requests, including `/mcp`. This mechanism is not part of the production Worker.
- Do not expose the compiled Worker directly on a public host without a trusted authentication boundary. Never accept caller-supplied owner headers.

## Integration status and limits

This is an independent web prototype and an **Alexa+ experience simulator**. It is **not connected to Alexa+ devices or developer tools, Ring or Amazon shopping history**. Amazon's Alexa+ add-on developer tools are not available to hackathon participants.

- Amazon Bedrock: live-verified on October 17-18, 2026 with `us.anthropic.claude-haiku-5-5` in `us-west-2` (see [docs/REVIEW_HANDOFF.md](docs/REVIEW_HANDOFF.md)). Short-term API keys expire; the status shows only the last real result.
- Dictation: verified with unit tests and simulated recognizer events in the real browser UI. A physical microphone test is still required on the recording machine; browser speech services can end sessions, and the text is then kept for an explicit resume.
- Photos are evidence only (no OCR or visual verification).
- One private workspace per user, stored as a JSON document with a revision (up to 100 orders and 500 receipts). A larger deployment should use normalized records.
- Reversals, supplier credits, returns, resolving historic damage, photo retention controls and stock-system integrations are future work.
- No outbound supplier messages, inventory adjustments, refunds or purchasing actions are performed.

## Verification

See the command table in [README.md](README.md#verification-commands) and the evidence in [docs/REVIEW_HANDOFF.md](docs/REVIEW_HANDOFF.md).

## JSON purchase order format

```json
{
  "reference": "PO-1045",
  "supplier": "Your supplier",
  "expected": "2026-10-16",
  "lines": [{"name": "Barista oat milk", "sku": "OM-06", "ordered": 12, "unit": "cases"}]
}
```
