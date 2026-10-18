# ReceiveRight: product feedback

This is ReceiveRight's product feedback for the Amazon Developer Hackathon. It covers each tool, API and SDK the project actually uses. It answers the five questions in the official rules for each one: what we used it for, what worked well, what needs work, onboarding, and whether we would build with it again.

- Primary track: Alexa+, through the simulated Alexa+ experience path. Mini challenge: AWS Builder (Amazon Bedrock). Select both on the Devpost form.
- Written 2026-10-17/18 from the project's own records: the code, [friction-log.md](friction-log.md), [bedrock-setup.md](bedrock-setup.md) and local verification runs. All numbers are local measurements on a development machine. No real customers use ReceiveRight and no user research was done. The hosted copy is owner-only, not a public deployment.
- Each issue below says who caused it. Problems in our code or our machine setup are labeled **ours**. They are not presented as defects in the vendor's product.
- The "would we build with it again" answers come from the engineering record. TODO (owner): confirm that they reflect your view before pasting them into Devpost.

## AWS Builder: AWS services used and how

The text below is written so it can be pasted into the Devpost Product Feedback answer.

> ReceiveRight uses one AWS service: **Amazon Bedrock**. It does not use S3, Lambda, AgentCore or Strands. The web app is hosted on Cloudflare/Sites, not on AWS.
>
> **How we use it.** ReceiveRight's conversational assistant turns a spoken or typed delivery description into a receipt draft, which a person then reviews. The server route `/api/assistant` calls the **Amazon Bedrock Runtime Converse API** with **tool use**. It sends `toolConfig.tools[].toolSpec` definitions and runs the `toolUse` / `toolResult` loop itself. The model is **Anthropic Claude Haiku 5.5**, invoked through the US **cross-Region inference profile** `us.anthropic.claude-haiku-5-5` from `us-west-2`. The server authenticates with a **Bedrock API key** sent as a bearer token. The key stays on the server and never reaches the browser. The Worker runtime calls the HTTPS endpoint with plain `fetch`, without an AWS SDK or SigV4 signing code.
>
> **What the model may do.** The model gets six tools, scoped to the selected purchase order: read the order, start a receiving draft, record received and damaged counts, update the note, prepare a receipt preview, and draft a supplier discrepancy report. It has no tool for confirming a receipt, and confirmation tokens never enter its context. Our code validates every tool call. The changes go to a staged copy of the workspace, and the whole turn commits atomically with a revision check. If Bedrock fails or someone edits the order at the same time, nothing is saved partially. Each user message allows at most 6 model calls, 12 tool calls and 1,400 output tokens per call, within a 55-second budget. Only a person can confirm a receipt, using the Review and Confirm & save buttons.
>
> **What we verified.** On 2026-10-17/18 we ran a live scenario set against Bedrock. It had 11 scenarios, run twice, and all 22 runs passed. The scenarios check that the assistant asks before recording an ambiguous count, applies corrections, refuses to confirm, and handles a second partial delivery. These are small acceptance checks of our prompts and harness, not accuracy benchmarks. We did not benchmark latency or cost.

## Summary

| Tool / API / SDK | What we used it for | Build with it again? |
| --- | --- | --- |
| Amazon Bedrock: Converse API with tool use, Bedrock API keys, cross-Region inference profiles, Claude Haiku 5.5 | Conversational receiving assistant (server side) | Yes |
| Model Context Protocol, revision 2025-11-25, Streamable HTTP | Self-hosted MCP server at `/mcp` and a small in-app MCP client for the simulated Alexa+ experience | Yes |
| Web Speech API (`SpeechRecognition`, `speechSynthesis`) | Browser dictation into editable text; "Read reply aloud" | Yes, as an optional input next to typing |
| ChatGPT Sites hosting with the Cloudflare Worker runtime, D1 and R2, plus Wrangler, Miniflare and Vinext | Original hosted project; runtime, database and photo storage; local emulation and Worker tests | Yes |
| pnpm | Package manager and script runner | Yes |

---

## 1. Amazon Bedrock

Converse API with tool use, Bedrock API keys, cross-Region inference profiles, Anthropic Claude Haiku 5.5.

### What we used it for

- **Converse API with tool use.** This runs the receiving assistant's agent loop in `lib/bedrock.ts` and `lib/receiving-agent.ts`. The six tool specs are built from the same JSON Schema definitions as the MCP server's tools (`lib/tool-definitions.ts`), filtered to the operations the model may use.
- **Bedrock API keys.** The server authenticates with a bearer token from the `AWS_BEARER_TOKEN_BEDROCK` setting. The key is stored only in the ignored local `.env` file or the host's server environment.
- **Cross-Region inference profiles.** `BEDROCK_MODEL_ID=us.anthropic.claude-haiku-5-5` with `AWS_REGION=us-west-2`.
- **Claude Haiku 5.5 on Bedrock.** This is the only model the assistant uses. We did not compare other models.

### What worked well

- **Bearer-key access from a non-AWS runtime.** A Bedrock API key let a Cloudflare Worker call `POST https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse` with one `Authorization: Bearer` header. We did not need an AWS SDK, request signing or an AWS account in the hosting runtime. The whole adapter is under 100 lines.
- **Tool-use format.** `toolSpec.inputSchema.json` takes standard JSON Schema. Our MCP tool definitions could be reused as they were, so the Bedrock assistant and the MCP endpoint share one source of truth for tool names, descriptions and argument limits.
- **Clear loop signals.** `stopReason` values (`tool_use`, `end_turn`) and `toolUse` blocks with IDs made the loop simple to write and test with recorded fixtures. Our compiled-Worker test runs the full route against fixture responses, including rollback on provider failure and a 409 on a concurrent edit.
- **Adaptive thinking.** Claude Haiku 5.5 returns `reasoningContent` blocks, because adaptive thinking is on by default. Our loop passes each assistant message back unchanged on the next call, and this worked with no special handling.
- **Model behavior on our scenario set.** In the live runs, the model asked for the count and condition when told "the rest arrived". For "ten arrived and one damaged", it asked whether the damaged case was included in the ten before writing anything. It asked which item was meant when "barista milk" was ambiguous, and asked before converting between cases and bags. It changed nothing when asked a status question. All 22 of 22 runs passed, as did 12 of 12 checks through the local dev server and database. These are small samples.
- **Accurate error responses.** The 400 for a bare model ID says that an inference profile is required. The 403 for an expired key says "Bearer Token has expired". Both were enough to diagnose the problem once we read the raw response.

### What needs work

| Area | What we observed | Whose issue |
| --- | --- | --- |
| Inference profiles | On 2026-10-17, `BEDROCK_MODEL_ID=anthropic.claude-haiku-5-5` returned HTTP 400 `ValidationException`: "Invocation of model ID … with on-demand throughput isn't supported. Retry … with the ID or ARN of an inference profile". The control plane reports `inferenceTypesSupported=[INFERENCE_PROFILE]` for this model. The error is correct, but it does not name the profile ID to use. We used the base model ID on our first live call and hit this error. Every AI feature was blocked until we switched to `us.anthropic.claude-haiku-5-5`. | Discoverability in Bedrock. **Ours:** the app first showed a generic "model doesn't support tool use" message. It now detects this case and names the profile ID format. |
| API key expiry | During a working session on 2026-10-17, the short-term Bedrock API key expired (short-term keys last up to 12 hours). The project owner reported this; we did not reproduce it with a naturally expired key. Bedrock returned 403 "Bearer Token has expired". We had no warning before the first failed request. | Expiry visibility in Bedrock. **Ours:** the app showed a generic "denied access" error with a 502 and logged nothing. It now shows a specific expired-key message, logs a non-secret failure category, shows a "last request failed" status, and has a **Test connection** button. Our adapter recognizes expiry by matching the word "expired" in the 403 body, which is brittle. |
| Model replies after a manual confirmation | When a person confirmed a receipt with the button in the middle of a conversation, the model later told the user that it had "not actually created" the earlier draft. It reproduced in 6 of 6 runs. The model sees only the text of earlier turns, not the button action. | **Ours** (harness design), not a Bedrock defect. A prompt change fixed it in 6 of 6 runs. |
| Markdown in replies | Replies used Markdown. It showed up as literal asterisks in the chat bubble and was read aloud. After we asked for plain text in the prompt, Markdown appeared in 7 of 42 replies, down from 26 of 36. | **Ours** to handle. Still open: the app does not yet strip formatting before display or speech. |
| Spending limits | The adapter limits each turn (calls, tokens, time), but has no account-wide spending cap. | **Ours.** It is documented in `bedrock-setup.md`. |

Details and reproduction steps are in [friction-log.md](friction-log.md), entries 1, 2, 5 and 6.

### Onboarding experience

The app needed three server values: `AWS_REGION`, `BEDROCK_MODEL_ID` and `AWS_BEARER_TOKEN_BEDROCK`. The adapter follows four AWS documentation pages, checked on 2026-10-17 and listed in [bedrock-setup.md](bedrock-setup.md): Bedrock API keys, using an API key with Converse, the Converse API reference, and tool use. Our first live call failed with the inference-profile 400 described above. After we switched to the profile ID, live calls worked on 2026-10-17, and the live checks described above passed on 2026-10-17/18. We did not record how long this took. The two Bedrock problems we hit were choosing the model ID and the key expiring. Both are now covered by specific in-app messages and in the README troubleshooting section.

### Would we build with it again?

**Yes.** Bearer-key access to Converse let us add a tool-using model to a non-AWS runtime with a small adapter. The tool-use format also matched the JSON Schemas we already had for MCP. Next time we would start with the inference profile ID and plan key rotation before any demo recording.

---

## 2. Model Context Protocol (revision 2025-11-25, Streamable HTTP)

### What we used it for

- **Self-hosted MCP server** (`app/mcp/route.ts`). Agent clients send `POST /mcp`. It uses stateless Streamable HTTP with JSON responses, no SSE stream and no server sessions, and `GET` returns 405. It supports `initialize`, `notifications/initialized`, `ping`, `tools/list` and `tools/call`. `tools/list` returns 11 tools, including `confirm_receipt`, for MCP clients that show the review to a person, and `create_demo_order`.
- **Minimal MCP client** (`lib/mcp-client.ts`, `lib/mcp-check.ts`). On the app's **Demo & integration** page, **Run MCP check (read-only)** sends real HTTP POSTs from the browser to `/mcp`. The sequence is `initialize` → `notifications/initialized` → `tools/list` → `tools/call get_workspace`. The client then compares the result with the website API. **Prepare MCP demo draft** creates and fills a fictional demo order through `tools/call`, but never confirms it. The same client runs headless in `pnpm mcp:smoke`. It is the core of the simulated Alexa+ experience.
- We did not use an MCP SDK. The server and client were written directly against the 2025-11-25 specification.

### What worked well

- **The stateless JSON subset is small.** The server route is about 40 lines and has no session store. It runs as one Worker route.
- **Spec details that were easy to test.** Standard JSON-RPC error codes (`-32700`, `-32600`, `-32601`, `-32602`), the `MCP-Protocol-Version` header and the fixed lifecycle order gave clear test targets. Our compiled-Worker suite checks 401, 403, each error code, version handling, owner isolation, and that the demo draft is never confirmed.
- **Shared tool definitions.** Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) and JSON Schema inputs let one set of definitions describe the tools to MCP clients and to Bedrock.
- **Observable end to end.** In Chrome on localhost, the panel reported protocol 2025-11-25, 11 tools and "Identical data". The browser's network log independently showed four `POST /mcp` requests (200, 202, 200, 200) and one `POST /api/receiving`. `pnpm mcp:smoke` passed every check against the running dev server.

### What needs work

| Area | What we observed | Whose issue |
| --- | --- | --- |
| Spec revisions during the hackathon | Our research on 2026-10-18 found that revision 2026-07-28 is now the current specification. The hackathon requires 2025-11-25 or later. Our server lists 2026-07-28 so that the hosting platform's `server/discover` call works, but it implements only 2025-11-25 behavior. Our client pins 2025-11-25. We read the code and found that `initialize` accepts a client that asks for 2026-07-28 and reports that version back. We have not tested this with a 2026-07-28 client. | **Ours.** It is documented ([friction-log.md](friction-log.md), entry 7). We did not change it, to avoid breaking the hosted connector. |
| Authorization | The server trusts user identity supplied by the Sites gateway. On the hosted site, `/mcp` is protected by the gateway's connector sign-in, so the browser MCP panel may get a 401 there. We document this and do not bypass it. There is no standalone OAuth flow for other MCP clients. | **Ours** (deployment design). |
| Browser calls to `/mcp` on the hosted site | In the first build (2026-10-16), the web UI called `/mcp` directly. On the deployed site it got a sign-in error, while the owner's MCP connector could read the same workspace. | **Ours.** We moved browser operations to the website-authenticated `/api/receiving` route. |
| No Alexa+ client to test against | The gated Alexa+ developer tools are not available to participants. Our server has therefore only been called by our own client and the hosting platform's connector, never by an Alexa+ client. | Hackathon access constraint. We do not claim an Alexa connection. |

### Onboarding experience

We did not record how long setup took. Writing the server and client without an SDK meant implementing the lifecycle handshake, `tools/list`, `tools/call`, JSON-RPC error handling and the protocol version header ourselves. The client also parses `text/event-stream` responses, so it can talk to servers that stream. The question still open at the end was which revision to claim, because the specification changed during the submission period.

### Would we build with it again?

**Yes.** The stateless JSON subset was enough for this use case, and it let one set of domain operations and tool definitions serve both the MCP endpoint and the Bedrock assistant. Next time we would decide early which revision to support and how authorization works outside the hosting gateway.

---

## 3. Web Speech API

### What we used it for

- **Dictation.** `SpeechRecognition`, or the prefixed `webkitSpeechRecognition` where the browser provides it, fills the assistant text box and the guided input. Text is never sent automatically. The person reviews or edits it before submitting. Recognition runs in `en-US`, continuously, with interim results (`lib/dictation.ts`).
- **Read aloud.** `speechSynthesis` reads the latest reply when the person presses **Read reply aloud**. It uses the browser's default voice; we do not select a voice. Any dictation in progress stops first, so the microphone does not pick up the app's own speech.

### What worked well

- **No server-side speech code.** Our app has no audio upload, speech service account or API key.
- **Interim results.** These let the text box fill while the person speaks, and the final text replaces them without duplication. We verified this with scripted recognizer events and unit tests for transcript assembly and the dictation state machine.
- **Standard error codes.** Codes such as `not-allowed`, `audio-capture`, `network`, `no-speech` and `language-not-supported` let us show a specific message for each case and keep the text captured so far.

### What needs work

| Area | What we observed | Whose issue |
| --- | --- | --- |
| Dictation cut off mid-sentence | The project owner reported that dictation stopped after "including one damaged" and dropped the rest of the sentence. We did not reproduce this with a microphone. The cause was in our code: recognition ran with `continuous = false` (the API default) and read only the first result. | **Ours.** We switched to continuous recognition with interim results, shared transcript assembly and an explicit resume. This is verified only with simulated recognizer events and unit tests ([friction-log.md](friction-log.md), entry 4). |
| Testing without a microphone | Real recognition needs a microphone and a person speaking, so our automated rehearsal injected scripted recognizer events into the real page. It checked that a full sentence was assembled once across interim and final segments and a pause, that the text box was read-only and Send was disabled while listening, and that stopping kept the text. | Limitation of the testing approach. A physical microphone check is still needed. TODO (owner): test dictation with a real microphone in the browser used for the demo video. |
| Browser coverage | We tested only Chrome on localhost, with a simulated recognizer. Safari, Firefox, Edge and mobile browsers were not tested. Our code checks for both the standard and the prefixed constructor, and turns dictation off outside a secure context. | Not tested by us; no claim either way. |

### Onboarding experience

Getting a first transcription took little code: create a recognizer and handle `onresult`. That first version was not enough for a long spoken sentence, because the default single-result mode ended early. A dependable version needed continuous mode, interim results, careful joining of segments, and handling for the end, error and stop events.

### Would we build with it again?

**Yes,** as an optional input next to typing, not as the only way to enter data. It added voice input with no server cost or credentials. Browser support and the lack of automated microphone testing mean the typed path must always work.

---

## 4. ChatGPT Sites hosting: Cloudflare Worker runtime, D1, R2, Wrangler, Miniflare, Vinext

### What we used it for

- The project started as a ChatGPT Sites project. The hosted deployment is signed in through the Sites gateway, which supplies the user's identity. It is not a public judge demo.
- On 2026-10-17 the source was exported for local development. The runtime is a Cloudflare Worker built with Vinext (`1.0.0-beta.5`) on Vite 8. D1 (SQLite) stores orders, drafts and receipts; R2 stores delivery photos, which are kept as evidence only.
- Wrangler (`4.92.0`) and Miniflare emulate the Worker, D1 and R2 locally in `.wrangler/state`. Three compiled-Worker test suites run against isolated D1 and R2 instances.

### What worked well

- **Local emulation without a cloud account.** `pnpm dev` runs the full app, including the database and photo storage, on localhost with no Cloudflare account.
- **Testing the production build.** We could test the compiled Worker locally: receiving, auth, MCP lifecycle, D1, R2, and the agent route with Bedrock fixtures. All three suites pass.
- **Gateway identity.** On the hosted site the gateway supplied the user's identity, so the app needed no sign-in or session code of its own. The owner's MCP connector could read the workspace through the same gateway.

### What needs work

These items come from the project friction log ([friction-log.md](friction-log.md), table entries dated 2026-10-16 and 2026-10-17) unless noted.

| Area | What we observed | Whose issue |
| --- | --- | --- |
| Managed preview | The browser preview had no Sites user identity, so signed-in flows could not be tested there. Only layout could be checked. | Platform preview limitation. We tested the compiled Worker with isolated identity fixtures instead. |
| Preview origin over HTTP | `crypto.randomUUID` was unavailable on the HTTP preview origin, so the first workspace request could not start. | Browser secure-context rule on a non-HTTPS origin. **Our** client now uses incrementing JSON-RPC request IDs. Server confirmation tokens stay cryptographically random. |
| Fetch options in the Worker runtime | The deployed-runtime test rejected `fetch(..., { redirect: "error" })`, although general `Request` documentation lists that option. | Runtime compatibility difference. We use `redirect: "manual"` and never forward credentials to a redirect target. |
| Miniflare and the Vinext build | The compiled Vinext Worker loads modules dynamically, and Miniflare could not discover them from the entry point. | Tooling gap between Vinext output and Miniflare. Our test harness passes the module list explicitly. |
| Miniflare assets routing | With the default assets configuration, requests did not reach our Worker and returned asset 404s. | Configuration default. Our harness sets `has_user_worker`. |
| Authentication tied to the gateway | Production auth trusts gateway identity headers. The compiled Worker must not be put on a public host without its own authentication boundary. On the hosted site, the browser MCP panel may get a 401 on `/mcp` (see section 2). | **Ours** (deployment design). TODO (owner): decide how judges get access, if at all. A locally runnable repository plus the video may be enough under the FAQ, but an organizer forum reply suggested an Alexa+ MCP server should stay live. |

### Onboarding experience

The local path is `pnpm install --frozen-lockfile`, then `pnpm setup:local`, then `pnpm dev`, then open http://localhost:5173 and use the loopback-only development sign-in. It worked on macOS with Node 25.2.1 (the README targets Node 24) and earlier on Linux with Node 24.19.0. Each of the test-harness issues above needed its own workaround, recorded in the friction log.

### Would we build with it again?

**Yes.** Emulating the Worker, D1 and R2 locally made the whole app, including its production build, testable on a laptop without an account. Next time we would add an authentication boundary that does not depend on the hosting gateway early, so that a judge-accessible deployment is a choice, not a rework.

---

## 5. pnpm

### What we used it for

- pnpm `11.25.0`, pinned in `packageManager`, installs dependencies from a frozen lockfile. The workspace policy came with the Sites export: a 7-day minimum release age for new packages, strict dependency builds with an explicit allow list, and `trustLockfile: false`.
- pnpm scripts are the single entry point for every check: `typecheck`, `lint`, `test`, `build`, `test:worker`, `mcp:smoke` and `check:bedrock-live`.

### What worked well

- Frozen-lockfile installs worked on both machines we used (Linux with Node 24.19.0, macOS with Node 25.2.1).
- One set of scripts covers setup, development and verification. That makes the steps easy to repeat in the README and for judges.

### What needs work

| Area | What we observed | Whose issue |
| --- | --- | --- |
| Custom CA file | `pnpm install` failed with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. The machine's `~/.npmrc` `cafile` held only corporate certificates, which replaced the default trusted roots. pnpm 11 ignored `npm_config_cafile`, and `pnpm_config_cafile` did not help. The workaround was a minimal user config, selected with `pnpm_config_userconfig`. | **Ours** (machine configuration), not a pnpm defect. The fix took longer because `npm_config_cafile` had no effect under pnpm 11. See [friction-log.md](friction-log.md), entry 3. |

### Onboarding experience

After the CA workaround, setup was the single `pnpm install --frozen-lockfile` command.

### Would we build with it again?

**Yes.** The pinned version and frozen lockfile made installs repeatable across two operating systems and Node versions.

---

## Tools we did not use

We did not use the following, so we have no feedback on them: the Alexa Skills Kit, the Alexa+ developer tools (gated, not available to participants), Ring, Fire TV, Bee, Amazon Bedrock AgentCore, Strands Agents, or any other AWS service besides Amazon Bedrock. ReceiveRight does not connect to Alexa or any Amazon device. The Alexa+ experience in the app is simulated, as the simulated-experience path allows.

## Feature requests (optional)

Each request comes from friction we observed while building ReceiveRight.

| # | Tool | Request | Why it matters to ReceiveRight | Priority |
| --- | --- | --- | --- | --- |
| 1 | Amazon Bedrock | When a model supports only inference profiles, name the matching system profile IDs for the caller's region in the on-demand-throughput error. Show the profile ID next to the base model ID in the model catalog and code examples. | Using the base model ID blocked every AI feature on our first live call. Our app now has to match the text "inference profile" to give a useful message. | Important |
| 2 | Amazon Bedrock | Make API key expiry visible and machine-readable: show the expiry time when the key is created, return it in a response header, and use a documented error code for "key expired". | An expired key turned into 502 errors partway through a working session. A key that expires during a demo recording would break the recording. Our adapter detects expiry by matching message text. | Important |
| 3 | Amazon Bedrock | Offer a short-term key option that clearly covers a working day or a recording session, scoped to invoking one model. | We want a narrowly scoped development credential that does not expire in the middle of a session. | Nice-to-have |
| 4 | Alexa+ | Give participants a way to test a self-hosted MCP server against an Alexa+ client or simulator. | We could test our MCP server only with our own client and the hosting platform's connector. We cannot say whether it works with Alexa+. | Important |
| 5 | pnpm | Document which `npm_config_*` environment variables pnpm 11 still reads, and the `pnpm_config_*` equivalents, for settings such as `cafile`. | We spent time on a CA problem because `npm_config_cafile` was ignored. | Nice-to-have |

## Evidence in this repository

- Bedrock adapter and error categories: `lib/bedrock.ts`. Agent loop and limits: `lib/receiving-agent.ts`. Shared tool definitions: `lib/tool-definitions.ts`.
- MCP server: `app/mcp/route.ts`. MCP client and in-app check: `lib/mcp-client.ts`, `lib/mcp-check.ts`, `app/mcp-panel.tsx`. Headless check: `scripts/mcp-smoke.mjs`.
- Dictation and read-aloud: `lib/dictation.ts`.
- Setup and live test guide: [bedrock-setup.md](bedrock-setup.md). Friction log with reproduction steps: [friction-log.md](friction-log.md). Verification notes: [verification.md](verification.md).
