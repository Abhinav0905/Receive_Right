# ReceiveRight conversational assistant

The web app includes a conversation panel and an Amazon Bedrock Converse adapter. It calls the same receiving domain operations that `/mcp` exposes, but in-process through its authenticated `/api/assistant` route: the conversation does not travel through MCP, and nothing here connects to Alexa hardware.

## Current status

The integration is implemented and was verified live on October 17-18, 2026 with `us.anthropic.claude-haiku-5-5` in `us-west-2` (see [REVIEW_HANDOFF.md](REVIEW_HANDOFF.md)). There is no simulated AI fallback: without settings the app shows **Setup needed** and manual receiving keeps working. Automated tests use deterministic provider fixtures; they do not establish live access or model quality.

### Status shown in the app

| Label | Meaning |
| --- | --- |
| Setup needed | One or more of the three settings is missing on the server. |
| Configured · not tested | Settings exist. No request has been made from this page yet, so access is not verified. |
| Bedrock responded · time | The last real request (a conversation turn or **Test connection**) succeeded at that time. It does not prove the key is still valid later. |
| Last request failed | The last real request failed; the message names the cause. |

**Test connection** (assistant card and Demo & integration page) sends one small live Converse request with the assistant's tool configuration. It reads and changes no receiving data and is never retried automatically.

### Failure messages

| Cause | What you see | Fix |
| --- | --- | --- |
| Expired API key (AWS 403 "Bearer Token has expired") | "The Amazon Bedrock API key has expired…" | Generate a new key, update `.env`, restart |
| Key not allowed / other 401-403 | "Amazon Bedrock denied access…" or "…cannot use the configured model" | Check the key's region and its permission for the model or profile |
| Bare model ID for a profile-only model | "…must be called through an inference profile…" | Use `us.`/`global.` profile ID |
| Other 400/404 | "Check that the configured Bedrock model supports Converse tool use…" | Pick a model/profile with Converse tool use in this region |
| 429 | "…throttling requests or the quota was reached…" | Wait, then send again yourself |
| Timeout / network | "…did not answer in time…" / "…could not be reached…" | Retry manually; check the network |

Provider error bodies are never shown or logged. The development server logs one line per failure with the category and the AWS status/error type, for example `[assistant] turn failed: expired_credentials (Bedrock HTTP 403 AccessDeniedException)`.

### Live check script

`pnpm check:bedrock-live` runs the acceptance scenarios below through the real agent loop and adapter on in-memory data (no database writes). It costs a small amount of AWS usage and needs a valid key. Results are written to the ignored `.live-check/` folder.

## AWS configuration

Choose a Bedrock model or inference profile that supports **Converse tool use** and is accessible in your AWS account and selected region. Use its exact model ID. Do not assume that a model named in an example is enabled for your account.

Current Claude models on Bedrock support only inference-profile invocation. Calling Converse with the bare model ID (for example `anthropic.claude-haiku-5-5`) fails with "on-demand throughput isn't supported". Use a system inference profile whose geography matches your region, such as `us.anthropic.claude-haiku-5-5`, or `global.anthropic.claude-haiku-5-5`. Verified October 17, 2026 in `us-west-2` with `us.anthropic.claude-haiku-5-5`.

Configure these three server runtime values:

| Name | Value | Secret? |
| --- | --- | --- |
| `AWS_REGION` | Your Bedrock region, for example `us-west-2` | No |
| `BEDROCK_MODEL_ID` | Exact model or inference-profile ID with Converse tool use | No |
| `AWS_BEARER_TOKEN_BEDROCK` | A Bedrock API key permitted to invoke that model | Yes |

Use the Sites runtime environment configuration for the hosted app, then deploy the saved version to apply the new environment revision. The key must remain server-side. Do not paste it into chat, GitHub, a frontend variable or the hosting manifest. For the local export, run `pnpm setup:local`, edit the generated `.env`, and restart `pnpm dev`. The Cloudflare development runtime loads `.env` into the server bindings. Do not create `.dev.vars` alongside it: that file takes precedence over `.env`. See README.md for the complete local setup.

Use a development credential with limited permissions and a suitable expiration. Track usage in your AWS account. This adapter makes at most six model calls per user message, with a 55-second overall budget, and requests at most 1,400 output tokens per call. It does not implement an account-wide spending cap.

Official references, checked October 17, 2026:

- [Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html)
- [Using an API key with Converse](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html)
- [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
- [Tool use](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html)

## First live test

1. Click **New demo run** to get a fresh fictional order. The panel should say **Configured · not tested**. Click **Test connection** once; the label changes only after that real request.
2. Ask **What is still outstanding?** Check the answer against the confirmed receipts. This should not change a draft.
3. Say **The rest arrived.** The assistant should ask for the physical count and damage condition. Treat this as an acceptance test, not a guaranteed model response.
4. On a fresh demo order, say **Ten arrived and one was damaged.** It should clarify whether the damaged item is included in the ten before changing quantities.
5. Answer **Ten total, including the damaged one.** Check the displayed draft, action trace and receipt review.
6. Correct a count before confirmation. The next review must reflect the correction.
7. Ask the assistant to confirm automatically. It has no confirmation tool. Use **Review receipt**, inspect the exact quantities and click **Confirm & save receipt** yourself.

For the existing PO-1043 example, first check current records. If one of eight bags is still the only confirmed delivery, seven remain. A new delivery of seven good bags should produce eight accepted in total, zero undelivered and two receipts after human confirmation. Do not repeat this delivery if it has already been recorded.

## Safety and failure behavior

- Only the selected order is sent to the model. Photo contents and confirmation tokens are excluded from model context.
- The assistant can read an order, start a draft, set counts, update a note, prepare a review and generate a supplier draft.
- The assistant cannot confirm receipts, import orders, access another selected order, send messages or alter inventory.
- Quantity validation runs in code. Model instructions alone are not trusted for arithmetic or authorization.
- Changes are staged for the whole turn. A model failure rolls them back. A concurrent workspace change prevents the assistant's stale turn from being committed (HTTP 409; the app then reloads the workspace).
- A turn is saved only if it really changed something. A draft the model opens but leaves empty is discarded, so questions leave no trace.
- Earlier turns are resent as text only. The instructions tell the model that the person may review and confirm in the app between messages, so it does not "correct" itself when a draft it prepared has become a receipt.
- Conversation text lasts for the current panel session. Switching orders or refreshing starts a new conversation; saved drafts and receipts remain available as fresh context.
- If a browser connection ends after the server commits, refresh the workspace before retrying. Chat requests are not automatically retried.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:worker
pnpm check:bedrock-live   # live, optional, small AWS cost
```

`tests/agent-worker-smoke.mjs` uses the compiled server and a real local D1 database but intercepts every Bedrock request with fixture responses. Passing it validates integration behavior, not live Bedrock access or conversational quality. Only `pnpm check:bedrock-live` and real conversations exercise the live service, and only for the moment they run.
