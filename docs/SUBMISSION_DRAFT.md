# ReceiveRight: Devpost submission draft

Status: draft for the owner to review and edit. Nothing has been submitted. Facts below were checked against the repository and local test runs on 2026-10-17/18. Items marked "TODO (owner)" can only be supplied or confirmed by the owner. Re-check the official rules and FAQ before pasting this into Devpost (deadline: Friday, October 23, 2026, 12:00 pm PT).

---

## Project name and tagline

**ReceiveRight**

Tagline: Say what arrived, check the numbers, then confirm the receipt yourself.

TODO (owner): confirm the final project name and tagline on Devpost.

## The problem

A small business, for example a café, receives a supplier delivery and needs to check it against the purchase order. The count is often messy: a few cases are missing, one is damaged, and the rest may arrive in a second delivery days later.

When this is tracked on paper or from memory, the totals drift. Damaged goods get counted as accepted, shortages are not claimed from the supplier, and a second delivery is added on top of the first one twice or not at all. A total of "12 arrived" does not tell you that one case was damaged and will not be sold.

## Who it is for

The intended audience is staff who receive deliveries at small businesses such as cafés, small restaurants and shops: people with full hands, standing at a back door, who need to record a count quickly and correctly.

We have not done user research or interviews. This is the audience we designed for, not a validated one.

## What it does

ReceiveRight turns a spoken or typed delivery count into a reviewed receipt that a person confirms.

Core flow:

1. Pick the purchase order for the delivery.
2. Say or type what arrived, for example "Ten cases of oat milk arrived in total, including one damaged."
3. ReceiveRight prepares a draft with received, damaged, accepted and undelivered quantities. Photos and notes can be attached as evidence.
4. A person opens **Review receipt**, checks the numbers and clicks **Confirm & save receipt**. The AI cannot do this step.
5. A supplier discrepancy report can be drafted for shortages and damage. It is a draft only and is never sent.
6. Later deliveries against the same order are recorded as separate receipts, and the order totals update.

The arithmetic is done in code, not by the model:

- received includes damaged
- accepted = received − damaged
- undelivered = ordered − total received

Worked example (12 cases of oat milk ordered):

| Step | Received | Damaged | Accepted | Undelivered | Receipts |
| --- | --- | --- | --- | --- | --- |
| Delivery 1: 10 arrived, including 1 damaged | 10 | 1 | 9 | 2 | 1 |
| Delivery 2: 2 good cases | 2 | 0 | 2 | 0 | 1 |
| Order totals after both | 12 | 1 | 11 | 0 | 2 |

After the second delivery the order is physically complete (0 undelivered), but only 11 cases were accepted. The damaged case stays in the record as history; completion is not the same as "everything arrived in good condition".

There are three ways to enter a count, and all of them use the same validated receiving operations and storage:

- **Conversation:** a Bedrock-powered assistant (described below).
- **Guided input:** a fixed phrase parser with no AI, for statements like "10 arrived, including 1 damaged".
- **Manual controls:** number fields for the received and damaged counts on the draft.

## How the Alexa+ simulation works

ReceiveRight is an independent web simulator of an Alexa+-style conversational experience, submitted through the simulated-experience path of the Alexa+ track. It has three parts.

**1. Browser dictation.** The microphone button uses the browser's Web Speech API. Speech becomes editable text in the input box; it is never submitted automatically. The person reads it, edits it if needed and presses Send. An optional **Read reply aloud** button uses the browser's built-in speech synthesis. Text entry always works without a microphone.

**2. Bedrock conversation.** The text goes to the app's own authenticated server route (`POST /api/assistant`), which runs a tool-use conversation with Amazon Bedrock. The model can read the selected order, start a draft, record counts, update a note, prepare a review and draft a supplier report. It cannot confirm a receipt. Details are in the AWS Builder section.

**3. A real MCP client against our own MCP server.** The app hosts a self-hosted MCP server at `/mcp` (stateless Streamable HTTP, JSON responses, MCP protocol 2025-11-25). The **Demo & integration** page contains an MCP client that runs in the browser:

- **Run MCP check (read-only)** sends `initialize` → `notifications/initialized` → `tools/list` → `tools/call get_workspace` as real HTTP POST requests to `/mcp`, then compares the result with the website's own API read. It reports the negotiated protocol version, the tool count (11) and whether the data is identical.
- **Prepare MCP demo draft** calls `create_demo_order`, `start_receiving`, `record_received_items` (3 received, including 1 damaged) and `preview_receipt` on a fictional order, `DEMO-MCP-CHECK`. It never confirms.
- The panel shows a sanitized request trace with no cookies, identity headers, tokens, notes or photo names.

In a local Chrome run, the panel showed protocol 2025-11-25, 11 tools and "Identical data", and the browser's network log showed four `POST /mcp` requests (200, 202, 200, 200) and one `POST /api/receiving`.

The MCP server exposes 11 tools: `get_workspace`, `load_demo_orders`, `create_demo_order`, `import_purchase_order`, `start_receiving`, `record_received_items`, `update_receiving_note`, `attach_evidence`, `preview_receipt`, `confirm_receipt` and `draft_discrepancy_report`. `confirm_receipt` exists for MCP agent clients that show the review to a person and get explicit approval first. The Bedrock assistant is not given this tool.

```
Conversation path:
  microphone or keyboard -> editable text -> POST /api/assistant
  -> Amazon Bedrock Converse (tool use) -> validated operations on a staged copy
  -> atomic commit -> draft -> human Review -> human Confirm & save -> receipt

MCP path (separate):
  in-app MCP client -> POST /mcp (Streamable HTTP, 2025-11-25)
  -> same receiving operations (lib/receiving.ts) -> same owner-scoped storage
```

The Bedrock assistant does not go through `/mcp`. It calls the same domain operations in-process. Both paths share `lib/receiving.ts` and the same owner-scoped storage, so they cannot disagree about the arithmetic.

### What is not connected

To be explicit:

- No Alexa device, Echo device or Alexa app is connected or was used.
- No Alexa developer tooling was used. The gated Alexa+ add-on tools (Category SDK, MCP Toolkit, CLI, Web Simulator) are not available to hackathon participants, and the Alexa Skills Kit was not used.
- The MCP server is not registered with or reachable from any Alexa service. Our MCP client is the web page itself.
- The voice is the browser's speech recognition and the browser's default speech synthesis voice, not Alexa's voice.
- No Ring, Fire TV, Bee or Amazon shopping data is used.
- No supplier messages, inventory changes, refunds or purchases are performed.

## AWS Builder: Amazon Bedrock integration

Amazon Bedrock is the only AWS service used. Hosting is not on AWS (see "How it was built").

| Item | What we used |
| --- | --- |
| API | Bedrock Runtime **Converse** API with tool use (`toolConfig` / `toolSpec`, `toolUse` / `toolResult` loop) |
| Model | Anthropic Claude Haiku 5.5 via the US cross-Region inference profile `us.anthropic.claude-haiku-5-5` |
| Region | `us-west-2` (configurable) |
| Authentication | Bedrock API key (bearer token), read only by the server from `AWS_BEARER_TOKEN_BEDROCK` |
| Code | `lib/bedrock.ts` (HTTP adapter), `lib/receiving-agent.ts` (agent loop), `app/api/assistant/route.ts` (route) |

**Tool use.** The model is offered six tools, all scoped to the currently selected order: `get_workspace`, `start_receiving`, `record_received_items`, `update_receiving_note`, `preview_receipt` and `draft_discrepancy_report`. Tool arguments are checked in code: a call naming another order or draft is rejected, and any tool outside the allowlist returns an error. There is no confirm tool, and confirmation tokens never enter the model's context. Photo contents are not sent to the model.

**Bounded, staged loop.** Each user message gets at most 6 model calls, at most 12 tool calls and a 55-second overall budget (each request also has its own timeout, and output is capped at 1,400 tokens per call). Tool operations are applied to a staged copy of the workspace. The whole turn is committed at once with a revision compare-and-swap. If the provider fails mid-turn, or someone else changed the workspace in the meantime, nothing from that turn is saved. A turn that only answers a question writes nothing.

**Model specifics.** Claude Haiku 5.5 returns `reasoningContent` blocks. The loop passes assistant messages back to Converse unchanged, which we observed working.

**Key handling.** The API key is a server environment variable. It is not sent to the browser, not included in the build output, not committed (`.env` is git-ignored) and not logged. Outbound requests do not follow redirects, so the key is never forwarded elsewhere.

**Failure handling.** Bedrock errors are mapped to specific categories, each with its own message to the user: expired key, access denied, model access, model configuration (for example a bare model ID instead of an inference profile), unsupported model, throttling, timeout, unreachable and invalid response. The server logs the category, never the raw provider detail. The assistant panel shows when the last request failed and has a **Test connection** button. Without Bedrock settings, the panel shows "Setup needed" and the guided and manual inputs still work. There is no simulated AI fallback.

**How we checked it.** All checks used fictional data on localhost.

- Automated tests replay recorded Bedrock responses (fixtures) through the compiled Worker, including rollback after a provider failure and a 409 on a concurrent edit. These do not prove live AWS access.
- A live script (`pnpm check:bedrock-live`) ran 11 conversational scenarios twice each against the real Bedrock endpoint, and 22 of 22 runs passed. Scenarios included: a status question that writes nothing, "the rest arrived" prompting for count and condition, "ten arrived and one damaged" prompting about whether the damaged one is included, corrections, a refusal to confirm, a second delivery ending at 12/11/1/0, multi-line orders, an ambiguous item name and a unit mismatch (cases vs bags).
- Through the running dev server and local database, on a fictional order, a separate set of 12 live checks passed (12 of 12). It covered a clarification with no write, a draft of 10 received with 1 damaged, a correction, rejection of a review token issued before the correction, a "just confirm it" request that created no receipt, and a status question with no write.

These are small scripted acceptance checks, not an accuracy benchmark. We make no latency claims.

**Not used:** S3, Lambda, AgentCore, Strands, SageMaker, IAM role or SigV4 signing (only Bedrock API keys are supported), and no account-wide spending cap.

## Safety and accountability

- **Only a person confirms.** A receipt is saved only after a person opens the review and clicks **Confirm & save receipt**. Asking the assistant to "just confirm it" does not create a receipt.
- **Review tokens.** Each review carries a token. Any edit to the draft invalidates it, so a person cannot confirm numbers they did not see. Confirming the same token twice returns the existing receipt instead of creating a duplicate.
- **Immutability.** Confirmed receipts cannot be edited. Earlier damage stays in the history after later deliveries.
- **Rollback.** Assistant turns are staged and committed atomically. A provider failure or a concurrent edit leaves no partial changes.
- **Validation in code.** Counts must be whole and nonnegative, and damaged cannot exceed received. These rules are enforced by the server, not by model instructions.
- **Scope.** The model only sees the selected order. Data is stored per signed-in user.
- **Drafts only.** Supplier reports are drafts and are never sent. Photos are evidence only, with no OCR or image analysis.

## How it was built

- **Frontend and server:** React and TypeScript on Vinext/Vite, compiled to a Cloudflare Worker runtime.
- **Storage:** Cloudflare D1 (SQLite) for orders, drafts and receipts; R2 for evidence photos. Local development uses Wrangler/Miniflare emulation, so no Cloudflare account is needed.
- **AI:** Amazon Bedrock Converse API with Claude Haiku 5.5 (above).
- **MCP:** our own minimal server and client following the MCP 2025-11-25 Streamable HTTP specification. No MCP SDK was used.
- **Voice:** browser Web Speech API (speech recognition and speech synthesis).
- **Hosting:** a private owner-only deployment on ChatGPT Sites (Cloudflare Worker runtime). It is not a public judge demo, and the current local version described here has not been deployed there.
- **Package manager and tests:** pnpm, Node's built-in test runner and Miniflare-based tests of the compiled Worker.

TODO (owner): list the team members and, if you wish to disclose them, any AI coding assistants used while writing the code.

## Work completed during the hackathon window

The submission period runs from August 31 to October 23, 2026 (12:00 pm PT). From the repository's own records:

| Date | Work |
| --- | --- |
| 2026-10-16 | Initial build of the receiving workspace, storage, MCP endpoint and sign-in (the first friction log entries are dated October 16). |
| 2026-10-17 | Bedrock adapter fix for the hosted runtime; source export and local setup; live Bedrock validation; inference-profile fix; prompt fixes (plain text replies, no retraction of earlier drafts). |
| 2026-10-17/18 | In-app MCP client panel and MCP smoke check; dictation rewrite; error and status categories; repeatable demo runs; documentation. |

This source export has no git history, so the dates above come from the friction log and the verification notes.

TODO (owner): confirm that no version of ReceiveRight existed before August 31, 2026. If an earlier version existed, describe what was added during the hackathon, as the rules require.

## Challenges

**Bedrock inference profiles.** Our first live call used the bare model ID `anthropic.claude-haiku-5-5`, and Bedrock returned HTTP 400: on-demand throughput is not supported for this model and an inference profile must be used. Our app showed a generic "model doesn't support tool use" message, which pointed in the wrong direction. The fix was to use the profile ID `us.anthropic.claude-haiku-5-5` and show a specific message for this error.

**Short-term API key expiry.** The owner reported that after about six hours the app started returning 502. The short-term Bedrock API key had expired (AWS returned 403 "Bearer Token has expired"), and our app showed a generic access-denied message and logged nothing. We added a specific expired-key message, a server log line with the failure category, a "last request failed" status and a **Test connection** button.

**Dictation stopped mid-sentence.** The owner reported that dictation cut off after "including one damaged". The cause was our code: recognition ran in single-result mode and read only the first result. We rewrote it to use continuous recognition with interim results, shared transcript assembly for both voice entry points and an explicit resume. We verified the fix with unit tests and with scripted recognizer events injected into the real page. We have not yet verified it with a physical microphone.

**The model retracted its own earlier work.** When a person confirmed a receipt with the button partway through a conversation, the model later told them it had "not actually created" the earlier draft, because it sees only the text of previous turns. We reproduced this 6 of 6 times. After a prompt change it passed 6 of 6. This was a design issue in our harness, not a Bedrock defect.

**Markdown in replies.** Replies often used Markdown, which showed up as literal asterisks in the chat bubble and was read aloud. After asking for plain text in the prompt, Markdown appeared in 7 of 42 replies, down from 26 of 36. It is reduced, not eliminated.

## Limits and what's next

Current limits:

- **No Alexa connection.** This is a web simulation. No Alexa device or Alexa developer tooling is connected (see "What is not connected").
- **No OCR.** Photos are stored as evidence only. Reading packing slips is future work and would need a review step.
- **Prototype storage.** Each user has one workspace stored as a revisioned JSON document in D1, limited to 100 orders and 500 receipts. A larger deployment would need normalized tables and indexed queries. There are no team roles or shared workspaces.
- **Hosted authentication.** The hosted site trusts identity headers from the Sites gateway. On that deployment, `/mcp` is authenticated through the gateway's connector flow, so the browser MCP panel may get a 401 there. We document this rather than bypass it. The compiled Worker must not be exposed on a public host without a trusted authentication boundary. Local `pnpm dev` uses a loopback-only development sign-in that is not included in the production Worker.
- **MCP version listing.** For the hosting platform's discovery, `server/discover` also lists protocol 2026-07-28, but the server implements 2025-11-25 behavior. `initialize` now always negotiates 2025-11-25, and our client pins it.
- **Not yet tested:** physical microphone dictation in any browser, Safari, Firefox, Edge, mobile devices and a public deployment.
- **No reversals.** Confirmed receipts cannot be reversed. Supplier credits, returns and resolving earlier damage are future workflows.
- **Bedrock credentials.** Only Bedrock API keys are supported, with no IAM role signing and no account-wide spending cap.

Next steps we would consider: packing-slip extraction with confidence scores and human review, normalized multi-user storage with roles, reversal and credit workflows, IAM-based credentials, and connecting the MCP server to Alexa+ if that developer tooling becomes available to us.

## Try it

The project runs locally, so a hosted site is not needed to try it. (Whether the rules also expect a live MCP server during judging is an open owner decision; see the hosting TODO below.) You need Node.js 24 (the README's target; also checked on Node 25.2.1 on macOS) and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

1. Open http://localhost:5173 and click **Sign in with ChatGPT**. On localhost this signs in a fictional local development user without contacting any external service.
2. Go to **Demo & integration** and click **Start a fresh demo run**. This adds a new fictional order (12 cases of oat milk) with its own reference (DEMO-OAT-NN, for example DEMO-OAT-03) and does not clear existing records.
3. Record the first delivery (10 received, including 1 damaged), review and confirm. Then record the second delivery (2 good cases) and confirm it.
4. On **Demo & integration**, click **Run MCP check (read-only)** to see the MCP client exchange.

The guided input, the manual controls and the MCP check work without AWS. The conversational assistant needs your own Bedrock settings (`AWS_REGION`, `BEDROCK_MODEL_ID`, `AWS_BEARER_TOKEN_BEDROCK`) in the git-ignored `.env`. AWS inference may incur small charges.

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:worker`, `pnpm mcp:smoke` (with `pnpm dev` running) and `pnpm check:bedrock-live` (live, needs a valid key).

Full instructions: [README.md](../README.md). Bedrock setup: [docs/bedrock-setup.md](bedrock-setup.md).

- TODO (owner): GitHub repository URL. It must be public with an open-source license file shown in the About section, or private and shared with the listed Amazon reviewers.
- TODO (owner): confirm the LICENSE file and copyright holder name, and confirm that the submission is solely owned by you or your team (check any employer IP agreement).
- TODO (owner): demo video URL (public on YouTube or Vimeo, English, under 3 minutes, with no third-party trademarks or unlicensed music).
- TODO (owner): decide whether to offer a hosted site to judges. If it is private, put judge credentials in the Devpost testing instructions, never in the repository. The FAQ says a runnable repository plus video is enough, but an organizer forum reply said an Alexa+ MCP server should stay live through judging. Ask the organizers, or rely on the simulated-experience path.

## Tracks and mini challenges to select

| Selection | Choice | Notes |
| --- | --- | --- |
| Primary track | **Alexa+** | Simulated Alexa+ experience path. The simulation source is in the repository, and the video must clearly show the simulated experience. Do not use the Alexa+ logo; plain-text "simulated Alexa+ experience" wording is fine. |
| Mini challenge | **AWS Builder** | Amazon Bedrock (Converse API with tool use). Describe the AWS usage in the Product Feedback answer, as the rules require. |
| Mini challenge | **Open Source**: not entered | It requires a separate new open-source project or a contribution to an existing public repository, plus a contribution URL. Open-sourcing this repository alone does not meet that requirement. Enter only if the owner decides to make such a contribution. |

Product Feedback (required for each tool, API or SDK used) and optional friction log entries are separate Devpost fields. See [docs/friction-log.md](friction-log.md).

TODO (owner): paste the final Product Feedback text, including the AWS Builder description, and generate a fresh Bedrock key before recording the video.
