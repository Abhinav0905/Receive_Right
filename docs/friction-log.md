# Developer friction log

This records observed development issues, not claims about the Alexa+ SDK. The gated Alexa+ developer tools have not been used in this build.

| Date | Observation | Effect | Resolution / next check |
| --- | --- | --- | --- |
| 2026-10-16 | Browser `crypto.randomUUID` unavailable on the HTTP preview origin. | Initial workspace request could not start. | Use an incrementing JSON-RPC request ID in the client. Confirmation tokens remain cryptographically random on the server. |
| 2026-10-16 | Managed browser preview lacks a Sites authenticated user identity. | Layout can be inspected; user-owned APIs correctly reject the preview session. | Preserve production auth and test the compiled Worker with isolated gateway identity fixtures. Verify owner sign-in on the deployed site. |
| 2026-10-16 | Compiled Vinext Worker uses dynamic module imports. | Miniflare cannot discover all modules from the entrypoint automatically. | Provide the build's JS module list explicitly in the integration harness. |
| 2026-10-16 | Miniflare assets configuration defaults did not route to the user Worker. | Test requests returned asset 404 responses. | Set `has_user_worker` in the test harness's assets router configuration. |
| 2026-10-16 | The deployed web UI returned a sign-in error while the owner's MCP connector could read the workspace. The browser was calling `/mcp`. | User could open the shell but could not load receiving data, and there was no sign-in action. | Move browser operations to the website-authenticated `/api/receiving` route. Render a top-level ChatGPT sign-in action when identity is missing or expires. Add compiled Worker tests for both page states and the separate browser receiving flow. |
| 2026-10-17 | The deployed-runtime test rejected Fetch `redirect: "error"` even though generic Request documentation lists it. | The Bedrock adapter failed before an outbound request. | Use `redirect: "manual"`, reject non-success responses and never forward authorization to a redirect destination. Verified in the compiled Worker fixture test. |

## Detailed entries (2026-10-17 to 2026-10-18)

The entries below follow the hackathon's friction log format: task attempted, steps, expected vs actual result, severity, workaround and an actionable suggestion. Each entry names the component involved and says who observed it.

Only entries 1 and 2 involve an Amazon service (Amazon Bedrock). Entries 3 to 7 are problems in our own app or our local tooling. They are listed so reviewers can see what changed and why, not as Amazon defects.

**Severity scale used here**

- **Critical**: blocks the core task with no workaround.
- **High**: blocks a major feature until a workaround or fix is found.
- **Medium**: degrades a feature, or blocks setup in a specific environment; a workaround exists.
- **Low**: cosmetic, or a latent risk with no observed failure.

**Index**

| # | Date | Component | Summary | Severity | Attribution |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-17 | Amazon Bedrock; our app (error message) | Bare model ID rejected; inference profile required | High | Observed by us |
| 2 | 2026-10-17 | Amazon Bedrock; our app (error message, logging) | Expired short-term API key surfaced as a generic error | High | Reported by the project owner |
| 3 | 2026-10-17 | Local tooling (pnpm, machine TLS config) | `pnpm install` failed on a corporate-only CA file | Medium | Observed by us |
| 4 | Not recorded (before the 2026-10-17/18 dictation rewrite) | Our app (Web Speech API usage) | Dictation cut off mid-sentence | Medium | Reported by the project owner; not reproduced by us with a microphone |
| 5 | 2026-10-17 | Our app (agent harness and prompt) | Model retracted its earlier draft after a person confirmed it | Medium | Observed by us |
| 6 | 2026-10-17 | Our app (prompt and plain-text display) | Replies contained Markdown, shown and read aloud literally | Low | Observed by us |
| 7 | 2026-10-18 | Our app (MCP server route) | Server lists a protocol revision it does not implement | Low | Observed by us (code review) |

### 1. Bedrock rejected the bare Claude Haiku 5.5 model ID for on-demand Converse calls

- **Date:** 2026-10-17
- **Component:** Amazon Bedrock (model ID and inference profile guidance). Our app's error mapping made it harder to diagnose.
- **Attribution:** Observed by us.
- **Task attempted:** Run the conversational receiving assistant locally against the Amazon Bedrock Converse API with tool use, using Anthropic Claude Haiku 5.5 in `us-west-2` and a Bedrock API key.
- **Steps to reproduce:**
  1. In the ignored `.env`, set `AWS_REGION=us-west-2`, `BEDROCK_MODEL_ID=anthropic.claude-haiku-5-5` and a valid `AWS_BEARER_TOKEN_BEDROCK`.
  2. Restart `pnpm dev` and open http://localhost:5173.
  3. Send any message in the receiving assistant (this calls Converse with `toolConfig`).
- **Expected:** A model reply, or an error that names the actual cause.
- **Actual:** Bedrock returned HTTP 400 `ValidationException`: "Invocation of model ID ... with on-demand throughput isn't supported. Retry ... with the ID or ARN of an inference profile". The Bedrock control plane reported `inferenceTypesSupported=[INFERENCE_PROFILE]` for this model. Our app turned the error into a generic message suggesting the model did not support tool use, which pointed at the wrong cause.
- **Severity:** High. No assistant turn could complete until the model ID was changed.
- **Workaround used:** Set `BEDROCK_MODEL_ID=us.anthropic.claude-haiku-5-5` (the US cross-Region inference profile). Verified working on 2026-10-17 in `us-west-2`.
- **Fix in our app:** `lib/bedrock.ts` now detects the inference-profile error and tells the user to set the profile ID and restart. `README.md` and `docs/bedrock-setup.md` explain the profile requirement.
- **Actionable suggestions for Amazon Bedrock:** These are suggestions based on our experience only. They are not statements about how AWS builds its console, catalog or errors, and we have not checked whether an equivalent already exists.
  - For models that can only be invoked through an inference profile, the model catalog and console code examples could show the matching profile IDs (for example `us.anthropic.claude-haiku-5-5`) next to the model ID. A developer copying an ID would then get one that works for on-demand calls.
  - The `ValidationException` could name the system inference profiles available for the caller's region, so the fix is visible in the error itself.

### 2. An expired short-term Bedrock API key surfaced as a generic 502

- **Date:** 2026-10-17
- **Component:** Amazon Bedrock (API key lifetime). Key expiry is expected behavior. The friction was in noticing and diagnosing it, and our app's generic error and missing log line were the main problem.
- **Attribution:** Reported by the project owner. The cause was identified from AWS's 403 response "Bearer Token has expired". We have no record of reproducing it ourselves with a naturally expired key.
- **Task attempted:** Keep using the receiving assistant during a long local development session.
- **Steps to reproduce:**
  1. Create a short-term Amazon Bedrock API key and set it as `AWS_BEARER_TOKEN_BEDROCK` in the ignored `.env`.
  2. Run `pnpm dev` and use the assistant normally.
  3. Several hours later (about 6 hours in the reported case), send another assistant message.
- **Expected:** A clear message that the key has expired and what to do next.
- **Actual:** `/api/assistant` returned HTTP 502 with a generic "Amazon Bedrock denied access" style message, and the server logged nothing. Bedrock's underlying response was HTTP 403 "Bearer Token has expired".
- **Severity:** High. The assistant was unusable until a new key was created, and the message suggested a permissions problem rather than expiry.
- **Workaround used:** Generate a new Bedrock API key, update `AWS_BEARER_TOKEN_BEDROCK` in `.env` and restart `pnpm dev`.
- **Fix in our app:**
  - A specific expired-key message: "The Amazon Bedrock API key has expired. Generate a new key, update AWS_BEARER_TOKEN_BEDROCK in .env and restart the server. Your draft was not changed."
  - A server log line with a fixed failure category (for example `expired_credentials`). It never includes the key or the provider response body.
  - A "Last request failed" status in the UI, and a **Test connection** button in the assistant.
- **Actionable suggestions for Amazon Bedrock:** These are suggestions, not statements about AWS internals. We have not checked whether equivalent options already exist.
  - Offer a longer-lived development key that is narrowly scoped (for example, to Converse on selected models), with its expiry time shown clearly in the console when it is created.
  - Return the key's expiry time in a response header, so applications can warn before requests start failing.

### 3. `pnpm install` failed because a user-level CA file held only corporate certificates

- **Date:** 2026-10-17
- **Component:** Local tooling (pnpm and this machine's npm configuration). This is our environment issue, not an Amazon defect.
- **Attribution:** Observed by us.
- **Task attempted:** Install the project's dependencies with `pnpm install --frozen-lockfile` on the development Mac (macOS, Node 25.2.1, pnpm 11.25.0).
- **Steps to reproduce:**
  1. Use a machine whose `~/.npmrc` sets `cafile` to a bundle containing only corporate CA certificates.
  2. Run `pnpm install --frozen-lockfile` in the repository.
- **Expected:** Dependencies install from the public registry.
- **Actual:** The install failed with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. A `cafile` setting replaces the default root certificates rather than adding to them. Setting `npm_config_cafile` had no effect because pnpm 11 ignores it, and `pnpm_config_cafile` did not help.
- **Severity:** Medium. Local setup was blocked on this machine, but the cause is specific to its configuration and a workaround exists.
- **Workaround used:** Point `pnpm_config_userconfig` at a minimal user config file that does not set the corporate `cafile`, and run the project's pnpm commands with it.
- **Actionable suggestions:**
  - For this repository: done. The `README.md` troubleshooting section now describes this error and how to fix the `cafile` setting.
  - For pnpm (not Amazon): when TLS verification fails, name the config file and key that set `cafile`, which would make this cause much quicker to find.

### 4. Browser dictation stopped after "including one damaged"

- **Date:** Not recorded. It was reported before the dictation rewrite on 2026-10-17/18.
- **Component:** Our app (how we used the browser Web Speech API). Not an Amazon or browser defect.
- **Attribution:** Reported by the project owner. Not reproduced by us with a microphone.
- **Task attempted:** Dictate a full delivery count into the assistant composer.
- **Steps to reproduce (before the fix):**
  1. Open **Receiving**, select a demo order and click the microphone in **Talk through this delivery**.
  2. Say: "Ten cases of oat milk arrived in total, including one damaged. Prepare the receipt for review." Pause naturally after "damaged".
- **Expected:** The full sentence appears in the editable text box.
- **Actual (as reported):** The text ended after "including one damaged", and the rest of the sentence was missing.
- **Cause in our code:** Recognition ran with `continuous = false` and the handler read only the first result, so the session ended at the first pause and later speech was dropped.
- **Severity:** Medium. Voice entry was unreliable. The text stayed editable and is never auto-submitted, so a cut-off sentence could not save wrong counts without the person sending it.
- **Workaround used:** Type the missing words, or dictate again.
- **Fix in our app (`lib/dictation.ts`):**
  - Continuous recognition with interim results.
  - One shared transcript assembly for both entry points (assistant composer and guided input).
  - An explicit resume that appends to the existing, possibly edited, text.
  - While listening, the text box is read-only and **Send** is disabled. Stopping keeps the text. Nothing is sent automatically.
- **Verification performed:** Unit tests cover transcript assembly and the dictation state machine. A Chrome rehearsal on localhost used a simulated recognizer, with scripted events injected into the real page and no microphone. The full utterance was assembled once across interim and final segments and a pause.
- **Not verified:** Physical microphone dictation in any browser; Safari, Firefox and Edge; mobile devices. TODO (owner): run a physical microphone test in the browser that will be used for recording.
- **Actionable suggestion (for builders using the Web Speech API, including us):** Use continuous recognition, assemble text from every result using `resultIndex`, and include a mid-sentence pause in manual tests.

### 5. The model retracted its earlier draft after a person confirmed the receipt

- **Date:** 2026-10-17
- **Component:** Our app (agent harness and system prompt). The model is Claude Haiku 5.5 on Amazon Bedrock, but the cause was our design, not a Bedrock defect.
- **Attribution:** Observed by us.
- **Task attempted:** Hold a receiving conversation in which the person confirms the receipt with the app's button between assistant turns.
- **Steps to reproduce (before the fix):**
  1. Ask the assistant to prepare a draft for a delivery, for example 10 received including 1 damaged.
  2. Without sending another message, use **Review receipt**, then **Confirm & save** in the app.
  3. Send a follow-up message in the same conversation.
- **Expected:** The assistant reads the fresh workspace, sees the confirmed receipt and treats it as the person's action.
- **Actual:** The model told the user it had "not actually created" the earlier draft. Our conversation history carries only the text of earlier replies, not the tool calls. When fresh data showed a confirmed receipt instead of the draft, the model doubted its own earlier reply. This happened in 6 of 6 runs.
- **Severity:** Medium. The reply contradicted what the person had just done. The stored receipt was not at risk, because confirmed receipts are immutable and the model has no confirm tool.
- **Workaround / fix:** The system prompt in `lib/receiving-agent.ts` now says that earlier turns show only text and that the person may review and confirm in the app between messages. It tells the model to treat differences in fresh data as the person's action and not to retract earlier replies. After the change, 6 of 6 runs passed. The scenario is also part of `pnpm check:bedrock-live`, where 22 of 22 scenario runs passed on 2026-10-17/18.
- **Actionable suggestion (for builders of tool-using assistants, including us):** When history is text-only, tell the model that the UI can change state between turns. A stronger option is to add a short note listing UI actions since the last turn. We have not implemented that note.

### 6. Assistant replies contained Markdown, which was shown and read aloud literally

- **Date:** 2026-10-17
- **Component:** Our app (system prompt and plain-text chat display).
- **Attribution:** Observed by us. The counts below are local measurements.
- **Task attempted:** Show assistant replies in the chat bubble and read them aloud with **Read reply aloud**.
- **Steps to reproduce (before the fix):**
  1. Send typical receiving messages to the assistant.
  2. Look at the reply in the chat bubble, then click **Read reply aloud**.
- **Expected:** Plain sentences that display cleanly and sound natural when spoken.
- **Actual:** 26 of 36 replies contained Markdown. Asterisks and similar markers appeared literally in the bubble and were read aloud.
- **Severity:** Low. The problem was cosmetic, but it affected the spoken output.
- **Workaround / fix:** The system prompt now asks for plain sentences without Markdown. Afterwards, 7 of 42 replies still contained Markdown, so this is reduced, not solved.
- **Actionable suggestion (for us):** Strip common Markdown markers before display and speech as a fallback. This is not implemented.

### 7. The MCP server lists protocol 2026-07-28 but implements 2025-11-25 behavior

- **Date:** 2026-10-18
- **Component:** Our app (MCP server route, `app/mcp/route.ts`).
- **Attribution:** Observed by us during code review and spec research. No failure has been observed.
- **Task attempted:** Check our MCP server's version negotiation against the current MCP specification revision while finishing the in-app MCP client.
- **Steps to reproduce:**
  1. Read `app/mcp/route.ts`, which lists `2026-07-28` and `2025-11-25`.
  2. Send an `initialize` request to `POST /mcp` with `protocolVersion` set to `2026-07-28`. Before the fix, the server agreed to `2026-07-28`.
- **Expected:** The server agrees only to protocol revisions whose rules it implements.
- **Actual:** The server lists `2026-07-28`, now the current spec revision, so that the hosting platform's connector discovery works. Its responses follow 2025-11-25 behavior. Our in-app client and `pnpm mcp:smoke` pin `2025-11-25`, and every check negotiated `2025-11-25`.
- **Severity:** Low. Nothing has failed. The risk is for a third-party client that requests `2026-07-28` and relies on that revision's rules.
- **Partial fix (2026-10-18):** `initialize` now negotiates only `2025-11-25` (the 2026-07-28 revision has no `initialize`). `server/discover` still lists both for the hosting platform.
- **Workaround used:** Our client pins `2025-11-25`. The limitation is documented in `RECEIVERIGHT.md`. We did not change the server's list, to avoid breaking the hosted connector.
- **Actionable suggestion (for us):** Either implement the 2026-07-28 rules, or remove `2026-07-28` from the list once the hosting platform's discovery no longer needs it. Re-test the hosted connector before making either change.

---

Record later Alexa-specific integration issues with exact reproduction steps, expected behavior, observed behavior, impact, and a proposed improvement. Do not present local hosting issues as Alexa platform defects.
