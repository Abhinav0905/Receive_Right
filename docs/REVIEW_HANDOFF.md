# Review handoff: MCP client, dictation, status, demo runs and submission docs

Prepared October 17-18, 2026 (Pacific evening / UTC morning) against the local checkout at `~/Downloads/receiveright`. Nothing was deployed, published, pushed or submitted. `.env`, existing purchase orders, drafts, receipts and photos were not modified or deleted.

## 1. Where to look

- **Local URL:** http://localhost:5173 (your `pnpm dev` server, PID started 11:43 AM, was left running; it hot-reloaded every change).
- **Fresh demo order:** `DEMO-OAT-03` — 12 cases of oat milk, fictional, untouched. It shows "Expected Oct 18" because it was created before demo runs started using the browser's local date; **New demo run** now uses your local date. (`DEMO-OAT-01` holds the rehearsed two-delivery run; `DEMO-OAT-02` an unconfirmed 9/1 rehearsal draft; `DEMO-MCP-CHECK` the MCP panel's dedicated order with a 3/1 draft.)
- **Your existing records were preserved:** PO-1042 (3 receipts, including one you added at 11:46 AM), PO-1043 (2), PO-1044 (1), PO-2001 and DEMO-3001 drafts. Nothing was deleted, reset or rewritten.
- **Review clicks:**
  1. Open http://localhost:5173 → **Sign in with ChatGPT** (local development identity) if asked.
  2. Receiving → select **DEMO-OAT-03** in Purchase orders (or click **New demo run** for another fresh one).
  3. In **Talk through this delivery**: microphone → say *"Ten cases of oat milk arrived in total, including one damaged. Prepare the receipt for review."* → stop → check text → **Send**.
  4. Check the draft: 10 received, 1 damaged, **9 accepted, 2 undelivered**. → **Review receipt** → **Confirm & save receipt**.
  5. Say/type *"Two more cases arrived, both in good condition."* → Send → **Review receipt** → **Confirm & save receipt**.
  6. **View receipts** (in the delivery panel) → history focused on DEMO-OAT-03: 2 receipts, 12 received, **11 accepted, 1 damaged (kept on record), 0 undelivered**. → **Draft supplier report** (nothing is sent).
  7. **Demo & integration** → **Run MCP check (read-only)** → see protocol, tools, "Identical data" and the request trace. Optionally **Prepare MCP demo draft** (changes only DEMO-MCP-CHECK's draft) and **Test Bedrock connection**.

### Demo arithmetic

| Moment | Received | Damaged | Accepted | Undelivered | Receipts |
| --- | --- | --- | --- | --- | --- |
| Fresh order | 0 | 0 | 0 | 12 | 0 |
| Draft after the spoken instruction | 10 | 1 | 9 | 2 | 0 |
| After confirming delivery 1 | 10 | 1 | 9 | 2 | 1 |
| Draft for delivery 2 (2 good) | 12 | 1 | 11 | 0 | 1 |
| After confirming delivery 2 | 12 | 1 (historical) | 11 | 0 | 2 |

All ordered units were physically delivered, but only 11 were accepted in good condition; the supplier report still lists the damaged case.

## 2. What changed and why

| Area | Files | Why |
| --- | --- | --- |
| Reusable MCP client | `lib/mcp-client.ts` (new), `lib/mcp-check.ts` (new) | Real Streamable HTTP lifecycle (initialize → notifications/initialized → tools/list → tools/call), version negotiation, `MCP-Protocol-Version`/`Accept` headers, JSON and SSE responses, JSON-RPC id checks, sanitized trace. One implementation used by the browser panel, the smoke script and the compiled-Worker test. |
| MCP verification panel | `app/mcp-panel.tsx` (new), `app/receiving-workspace.tsx`, `app/globals.css` | Demo & integration shows negotiated version, tool count/names, success/errors, durations, comparison with the website API, explicit draft action on DEMO-MCP-CHECK (never confirms). Status comes only from completed requests. |
| MCP route | `app/mcp/route.ts` | Reject requests whose id is null or not a string/number. `initialize` now negotiates only 2025-11-25 (the 2026-07-28 revision has no initialize; `server/discover` still lists both for the hosting platform). Stored review tokens are removed from MCP tool output, so an MCP client can confirm only a review it prepared itself. Authentication and origin check unchanged. |
| Smoke check | `scripts/mcp-smoke.mjs` (new), `package.json` (`mcp:smoke`) | Repeatable protocol check against the running local server via the loopback development sign-in, plus 401/403/-32700/-32602/version negative checks. Refuses non-loopback URLs. |
| Dictation | `lib/dictation.ts` (new), `hooks/use-dictation.ts` (new), `app/receiving-assistant.tsx`, `app/receiving-workspace.tsx` | Fixes the reported cut-off: the old code used `continuous=false` and read only the first result. Now continuous + interim results, one transcript assembler rebuilt from the full results list (no duplicated revisions), text kept on end/error/stop, explicit resume, read-only box and disabled Send/Apply while listening, late finals after stop kept, aborted sessions ignored, single recognizer across the page, speech playback cancelled before listening and dictation stopped before reading aloud, fatal errors finalize immediately (Safari may not fire `end`), guidance per error. |
| Shared Bedrock status | `hooks/use-assistant-status.ts` (new), `app/api/assistant/test/route.ts` (new), `app/api/assistant/route.ts`, `lib/bedrock.ts`, UI | One status for the whole app: Setup needed / Configured · not tested / timestamped last real result. Explicit **Test connection** (one live request, no data change, no retry). Failure categories with fixed messages (expired key, denied, model access, inference profile, unsupported model, throttled, timeout, unreachable, provider error). Server log line with category and AWS status/type only. Region and model ID (not secrets) shown. |
| Agent loop | `lib/receiving-agent.ts` | A turn is saved only when state really changed; a draft the model opened but left empty is discarded (questions leave no trace). Staging, rollback and the revision check are unchanged. Prompt changes from the previous session (plain text; person may confirm between messages) kept. |
| Demo runs | `lib/receiving.ts`, `lib/tool-definitions.ts`, UI | `create_demo_order` adds a new fictional `DEMO-OAT-NN` order (or reuses `DEMO-MCP-CHECK`) without touching existing data. "New demo run" buttons, DEMO labels, receipt-history filter/focus with per-order totals, truthful post-confirmation notice (undelivered vs damaged vs complete). |
| Readability/accessibility | `app/globals.css`, components | Minimum 10 px for disclosure/suggestion text, status/alert roles, `aria-pressed` on mics, labelled dictation status, mobile wrapping for new controls; pre-existing lint error (unescaped apostrophe) fixed. |
| Tests | `tests/mcp-client.test.mjs`, `tests/dictation.test.mjs`, `tests/mcp-worker-smoke.mjs` (new); `tests/receiving.test.mjs`, `tests/receiving-agent.test.mjs`, `tests/worker-smoke.mjs` | See section 3. `pnpm test` now includes the MCP client and dictation tests; `pnpm test:worker` includes the MCP client against the compiled Worker. |
| Live check | `scripts/live-bedrock-check.mjs` (new), `package.json` (`check:bedrock-live`), `.gitignore` (`/.live-check/`) | Opt-in live Bedrock acceptance scenarios on in-memory data. |
| Review fixes | several | An independent 4-lens review (MCP, dictation, agent/status, UI) found 34 issues: 5 raised as medium were adversarially verified (3 confirmed medium, 1 confirmed and downgraded to low, 1 refuted); 29 low were not individually verified. Fixed: guided dictation kept listening after page/order changes (now stopped/aborted through one helper; Review disabled while listening; dictation stopped before dialogs); Bedrock 400/404 model-access and 408 timeouts mis-categorized; turn trace said "updated" when nothing was saved; read-only turns pushed a stale snapshot (now reloads); duplicate DEMO-MCP-CHECK reference; tokens visible to MCP clients; untested connection-test route (now in the compiled suite); stale-timer race in dictation; dictation messages never cleared; MCP trace (tool names, session id redaction, broader key redaction, response-only SSE matching, strict 202, transport labels); panel busy coordination and separate comparison errors; hard-coded "Workspace loaded"; focus outlines, 12 px reconciliation line, aria-current, visible unavailable-dictation guidance; supplier-report button without receipts; sign-in loss on Demo page; heading actions before load; CSS spacing. Not fixed: tokens embedded inside free text are not scrubbed from traces (only keyed fields are); the order list still appends new orders at the end (the list scrolls to the selection, the page does not). |
| Docs | `README.md`, `RECEIVERIGHT.md`, `docs/bedrock-setup.md`, `docs/verification.md`, `IDE_HANDOFF.md`, `LICENSE` (new), `docs/SUBMISSION_DRAFT.md`, `docs/DEMO_SCRIPT.md`, `docs/PRODUCT_FEEDBACK.md`, `docs/SUBMISSION_CHECKLIST.md` (new), `docs/friction-log.md` | Accurate run instructions, architecture, two separate paths (Bedrock in-process vs MCP over HTTP), limits, submission drafts. |

A full diff against the pre-session snapshot is in the scratchpad (`session2.diff`); there is no Git history in this folder.

## 3. Verification (what was actually run)

Results below are from this machine (macOS, Node 25.2.1, pnpm 11.25.0). Timings are localhost measurements and say nothing about a public deployment.

### Before any edits (baseline)

`pnpm typecheck` pass · `pnpm test` 21/21 · `pnpm build` pass · `pnpm test:worker` 2/2 suites · `pnpm lint` **1 error + 1 warning (pre-existing**: unescaped `'` in `app/receiving-assistant.tsx`, unused import in a test) — both fixed.

### After the changes

| Check | Kind | Result |
| --- | --- | --- |
| `pnpm typecheck` | static | pass |
| `pnpm lint` | static | pass, 0 problems |
| `pnpm test` | unit, fixtures | 44/44 pass |
| `pnpm build` | build | pass |
| `pnpm test:worker` | **built runtime** (Miniflare + local D1/R2), Bedrock fixtures | 3/3 suites pass (rebuilt after the last source change) |
| `pnpm mcp:smoke` and `pnpm mcp:smoke -- --draft` | real HTTP to the running dev server | all checks pass |
| `pnpm check:bedrock-live -- 2 4`, then `-- 1 4` on the final code | **live Bedrock**, in-memory data | 22/22 (63 model calls), then 11/11 (35 model calls); 0 provider errors |
| Server-level rehearsal on DEMO-OAT-02 | **live Bedrock** through the dev server, persisted D1 rows checked | 12/12 |
| Browser recording rehearsal on DEMO-OAT-01 | **browser** (Chrome) + live Bedrock; **simulated** speech-recognition events | all 8 recording steps completed |
| Browser MCP panel | browser network log | 4 × POST /mcp (200, 202, 200, 200) + 1 × POST /api/receiving |
| Browser status states | browser; one live test + one browser-side failure fixture | "Configured · not tested" → "Bedrock responded · 7:35:24 PM"; fixture failure shows "Last request failed" with the expired-key message |
| Mobile width (390 px iframe) | browser | no horizontal page overflow on Receiving and Demo & integration |
| **Physical microphone** | — | **Not performed — manual microphone verification required** (steps in section 6) |

Fixture tests and the simulated recognizer do not establish live AWS access or real microphone behavior.

### MCP request sequence (real, sanitized)

From `node` using `lib/mcp-client.ts` against http://localhost:5173/mcp (the browser panel produced the same sequence):

| # | Method | HTTP | Content-Type | Request headers (sanitized) |
| --- | --- | --- | --- | --- |
| 1 | `initialize` (id 1, protocolVersion 2025-11-25, capabilities {}, clientInfo) | 200 | application/json | Content-Type, Accept: application/json, text/event-stream, Cookie [redacted] |
| 2 | `notifications/initialized` (no id) | 202 | — | + MCP-Protocol-Version: 2025-11-25 |
| 3 | `tools/list` (id 2) | 200 | application/json | + MCP-Protocol-Version: 2025-11-25 |
| 4 | `tools/call · get_workspace` (id 3) | 200 | application/json | + MCP-Protocol-Version: 2025-11-25 |

Negotiated version **2025-11-25**; server `ReceiveRight 0.1.0`; **11 tools**: get_workspace, load_demo_orders, create_demo_order, import_purchase_order, start_receiving, record_received_items, update_receiving_note, attach_evidence, preview_receipt, confirm_receipt, draft_discrepancy_report. Sanitized tools/call response: `{"content":[{"type":"text","text":{"workspace":{"orders":7,"drafts":3,"receipts":8,"details":"omitted from trace"},"result":null}}],"isError":false}`. The MCP workspace was identical to the website API read (review tokens excluded, since MCP withholds them). With `--draft`, four more `tools/call` requests followed: `create_demo_order`, `start_receiving`, `record_received_items`, `preview_receipt` — never `confirm_receipt`.

## 4. Authentication and hosting limits

- Local: the browser panel, `/api/*` and `/mcp` share the loopback-only development session. No identity is injected for non-loopback requests; caller-supplied `oai-authenticated-*` headers are stripped by the dev middleware.
- Hosted Sites: the Worker trusts gateway identity headers; `/mcp` is authenticated by the gateway's connector flow, so the browser MCP panel may get 401 there. Not bypassed. The compiled Worker must not be exposed directly on a public host.
- `server/discover` lists protocol `2026-07-28` (now the current spec revision) for the hosting platform's discovery, but the server implements 2025-11-25; `initialize` negotiates 2025-11-25. A client that only speaks 2026-07-28 would not work. Re-test the hosted connector after these local changes are deployed (the token withholding and initialize change affect `/mcp`).
- The Bedrock key in `.env` is a short-term key that expires at about **11:43 PM PDT on October 17 (06:43 UTC October 18)**. Generate a new one before recording.

## 5. Remaining submission TODOs (owner)

See [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md). In short: GitHub repo (public with the license visible, or private with the listed reviewers), public English video under 3 minutes, Devpost text from [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md), Product Feedback from [PRODUCT_FEEDBACK.md](PRODUCT_FEEDBACK.md) (includes the AWS Builder answer), confirm the LICENSE holder and sole ownership, confirm no pre-August-31 version, decide on hosting given the FAQ vs forum-reply conflict, fresh Bedrock key, physical microphone test.

## 6. Manual checks still required

**Physical microphone (Chrome or Edge on the recording machine):**
1. Open http://localhost:5173, select DEMO-OAT-03, click the assistant microphone and allow microphone access.
2. Say the full sentence in one go: *"Ten cases of oat milk arrived in total, including one damaged. Prepare the receipt for review."* Confirm the whole sentence appears once, with no repeated words.
3. Repeat with a 3-4 second pause before "Prepare the receipt for review." If the browser ends the session during the pause, the first part must stay and a message must say the text is kept; click the microphone again and say the rest.
4. Click stop mid-sentence, edit a word, click the microphone again and continue; confirm your edit is kept.
5. Confirm Send stays disabled while listening, then send deliberately.
6. Click **Read reply aloud** while dictating: dictation must stop first. Start dictation while a reply is being read: the reading must stop.
7. Deny microphone permission once (site settings): a "Microphone access is blocked" message appears and typing still works.
8. Repeat step 2 in the guided input box ("10 arrived, including 1 damaged").

Other manual checks not done here: Safari/Firefox, mobile devices, hosted deployment, Windows.

## 7. Failed checks

None of the checks listed above failed in the final run. During the work: the compiled MCP suite failed once because MCP now withholds review tokens and the comparison still included them (fixed by comparing without tokens); a lint error appeared from a new effect and was resolved. During development: two earlier harness "failures" were regex false positives in my own test script (fixed); a reproduced model behavior issue (retracting a draft after the person confirmed between turns) was fixed in the prompt in the previous session and re-verified live. The browser console shows one hydration warning caused by the Grammarly browser extension (`data-gr-ext-installed` attributes), not by the app.
