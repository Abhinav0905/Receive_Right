# ReceiveRight

A receiving workspace for small businesses. Compare a supplier delivery with its purchase order, record shortages and damage, attach evidence, review the result and explicitly confirm a receipt. You can describe the delivery by voice or text to a conversational assistant built on **Amazon Bedrock**, and the same receiving operations are exposed by a self-hosted **MCP server** that the app checks with a real MCP client.

**Status (October 18, 2026):** runs locally; manual receiving works without AWS. The Bedrock assistant was verified live with a valid key (see [the review handoff](docs/REVIEW_HANDOFF.md)). This is an **independent web simulator of an Alexa+ experience**. It is not an installed Alexa skill and is not connected to Alexa devices, Ring or Amazon shopping history.

## What happens in a delivery

12 cases of oat milk were ordered. 10 arrive, including 1 damaged:

| | Received | Damaged | Accepted | Undelivered |
| --- | --- | --- | --- | --- |
| After delivery 1 (receipt 1) | 10 | 1 | 9 | 2 |
| After delivery 2 of 2 good cases (receipt 2) | 12 in total | 1 (kept on record) | 11 | 0 |

Received includes damaged goods. Each later delivery is a new receipt; corrections replace the current draft's counts instead of adding again. Everything ordered can be delivered while one case is still a damaged-goods issue for the supplier. Only a person can confirm a receipt.

## Prerequisites

- Node.js 24.x (`.nvmrc`; Node 22.18+ also satisfies `engines`; this checkout was also run with Node 25.2.1)
- pnpm 11.25.0 (`npm install --global pnpm@11.25.0`). Keep `pnpm-lock.yaml`; do not mix npm/yarn lockfiles.
- A Chromium-based desktop browser (Chrome or Edge) for dictation. Typing works everywhere.
- Optional, for the assistant: an AWS account with Amazon Bedrock access and a Bedrock API key.

## Install and start

```sh
pnpm install --frozen-lockfile
pnpm setup:local      # creates .env from .env.example if missing, applies local D1 migrations; safe to rerun
pnpm dev              # http://localhost:5173
```

Open **http://localhost:5173** and click **Sign in with ChatGPT**. On this loopback development server that button signs in a fictional local user (`seedy@sites.test`) without contacting ChatGPT. Use one hostname consistently (localhost and 127.0.0.1 have separate cookies).

Local data lives in the ignored `.wrangler/state/` folder (D1 and R2 emulation; no Cloudflare account needed). `pnpm db:migrate` applies pending migrations only. Nothing in the app clears existing orders or receipts.

The development sign-in is limited to loopback requests and is not part of the production Worker. `pnpm start` runs the compiled Worker *without* it, so use `pnpm dev` for local demos.

## Connect Amazon Bedrock (server-only settings)

Edit the ignored `.env`, then restart `pnpm dev`:

```dotenv
AWS_REGION="us-west-2"
BEDROCK_MODEL_ID="us.anthropic.claude-haiku-5-5"
AWS_BEARER_TOKEN_BEDROCK="your-bedrock-api-key"
```

- Use a model or **inference profile** that supports Converse tool use. Current Claude models on Bedrock must be called through an inference profile (`us.` or `global.` prefix); the bare ID `anthropic.claude-haiku-5-5` is rejected for on-demand use.
- The key is a Bedrock API key (bearer token). Short-term keys expire after at most 12 hours; generate a fresh one before recording or judging sessions.
- Never prefix these with `VITE_` or `NEXT_PUBLIC_`, never commit `.env`, and do not create `.dev.vars` (it would override `.env`). Only the placeholder `.env.example` is tracked.
- The assistant shows **Setup needed** when settings are missing, **Configured · not tested** when they exist, and a timestamped result only after a real request (a conversation turn or **Test connection**). A past success does not prove the key is still valid.
- AWS inference may incur charges. Each message makes at most 6 model calls within 55 seconds; there is no account-wide budget limiter.

Details and acceptance tests: [docs/bedrock-setup.md](docs/bedrock-setup.md).

## Demo walkthrough (repeatable)

1. Click **New demo run** (Receiving page) or **Start a fresh demo run** (Demo & integration). A new fictional order such as **DEMO-OAT-03** (12 cases of oat milk) is created and selected. Existing data is never reset.
2. In **Talk through this delivery**, click the microphone and say: *"Ten cases of oat milk arrived in total, including one damaged. Prepare the receipt for review."* Click stop, check the text, then **Send**. (Or type it.)
3. The draft shows **10 received, 1 damaged, 9 accepted, 2 undelivered**. The action trace lists the validated steps the assistant took.
4. Click **Review receipt**, check the exact counts, then click **Confirm & save receipt**. The assistant cannot confirm.
5. Say or type *"Two more cases arrived, both in good condition."* Review and confirm the second delivery.
6. Click **View receipts**: receipt history focuses on this order and shows two receipts, **12 received, 11 accepted, 1 damaged (kept on record), 0 undelivered**.
7. Click **Draft supplier report**. It is a draft; nothing is sent.
8. Open **Demo & integration** → **Run MCP check (read-only)** to show a real MCP exchange with this app's server.

Without AWS settings, use the guided input ("10 arrived, including 1 damaged") or the count table instead of the assistant. The recording script is in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Three input paths, one review

| Path | What it does | AI? |
| --- | --- | --- |
| Browser dictation | The browser's speech service turns speech into editable text in the box. It never submits. | No (browser service) |
| Guided input | A fixed phrase parser applies counts such as "10 arrived, including 1 damaged". | No |
| Bedrock assistant | Amazon Bedrock (Converse with tool use) reads the selected order, asks about unclear counts, units or items, and prepares a draft through validated receiving operations. | Yes |

All three end at the same human review and confirmation.

## Architecture

```text
Conversation path (Bedrock does not use MCP)
  Browser: dictation -> editable text -> Send
     -> POST /api/assistant (website session, origin check)
     -> lib/receiving-agent.ts: bounded loop (<= 6 model calls, <= 12 tool calls, 55 s)
          <-> Amazon Bedrock Converse API (server-side API key, tool use)
          -> validated receiving operations (lib/receiving.ts) on a staged copy of the workspace
     -> one atomic commit with revision check (lib/store.ts, D1); provider failure or concurrent edit = nothing saved
     -> draft + review in the UI -> person clicks Confirm & save -> immutable receipt (D1)

MCP path (separate)
  MCP client (in-app panel, pnpm mcp:smoke, MCP agent clients)
     -> POST /mcp  (Streamable HTTP, JSON responses, protocol 2025-11-25)
     -> the same validated receiving operations and owner-scoped storage
```

The assistant may only read the selected order, open/resume its draft, set counts, set a note, prepare a review and draft a supplier report. It has no confirmation tool, and review tokens never reach the model. The MCP server additionally offers `confirm_receipt` for MCP clients that show the exact review to a person first (stored review tokens are never included in MCP output; a client must prepare its own review), plus `create_demo_order`. More detail: [RECEIVERIGHT.md](RECEIVERIGHT.md).

## MCP smoke check

With `pnpm dev` running in another terminal:

```sh
pnpm mcp:smoke                 # read-only: initialize, notifications/initialized, tools/list, tools/call get_workspace + negative checks
pnpm mcp:smoke -- --draft      # also prepares a review on the fictional DEMO-MCP-CHECK order via tools/call (never confirms)
```

The script signs in through the loopback-only development sign-in, exactly as the browser button does locally, and refuses non-loopback URLs. In the app, **Demo & integration → Run MCP check** performs the same lifecycle from the browser and shows the negotiated version, tools, request durations and a sanitized trace.

**Hosting limit:** locally, the browser panel and `/mcp` share the website session. On the hosted Sites deployment `/mcp` is authenticated by the hosting gateway for connector clients, so the browser panel may receive 401 there. This is documented rather than bypassed.

## Verification commands

| Command | What it proves |
| --- | --- |
| `pnpm typecheck` | TypeScript validation |
| `pnpm lint` | ESLint (Next.js rules) |
| `pnpm test` | Domain arithmetic, demo runs, agent loop with Bedrock fixtures, MCP client transport, dictation assembly |
| `pnpm build` | Production Worker and browser assets |
| `pnpm test:worker` | Compiled Worker with isolated D1/R2: receiving/auth/MCP, agent route with fixtures (rollback, concurrent edits), reusable MCP client over HTTP. Run `pnpm build` first. |
| `pnpm mcp:smoke` | Real MCP requests to your running local server |
| `pnpm check:bedrock-live` | **Live** Bedrock scenarios on in-memory data (no database writes; small AWS cost; needs a valid key) |

Fixture tests do not prove live AWS access or model quality; only `check:bedrock-live` and real conversations do, and only for the moment they run.

## Source map

| Path | Responsibility |
| --- | --- |
| `app/receiving-workspace.tsx` | Orders, counts, evidence, review, confirmation, receipt history, demo runs, integration page |
| `app/receiving-assistant.tsx` | Conversation, dictation, Bedrock status and action trace |
| `app/mcp-panel.tsx` | In-browser MCP client panel and sanitized trace |
| `app/api/assistant/route.ts`, `app/api/assistant/test/route.ts` | Conversation endpoint and explicit connection test |
| `app/mcp/route.ts` | Stateless MCP endpoint |
| `lib/bedrock.ts` | Server-only Converse adapter and failure categories |
| `lib/receiving-agent.ts` | Bounded model/tool loop, selected-order context, staged changes |
| `lib/receiving.ts` | Validated receiving operations and quantity arithmetic |
| `lib/store.ts` | Owner-scoped persistence and atomic updates |
| `lib/mcp-client.ts`, `lib/mcp-check.ts` | Reusable MCP Streamable HTTP client and verification flows |
| `lib/dictation.ts`, `hooks/use-dictation.ts` | Shared dictation state machine and React binding |
| `hooks/use-assistant-status.ts` | Shared Bedrock status for the whole page |
| `scripts/mcp-smoke.mjs`, `scripts/live-bedrock-check.mjs` | Protocol smoke check; opt-in live Bedrock check |
| `tests/` | Unit and compiled-Worker tests |
| `docs/` | Setup, demo script, submission drafts, feedback, friction log, review handoff |

## Put the source on GitHub

There is no Git history in this export. Create an empty repository, then from this folder:

```sh
git init
git add .
git status --short
git check-ignore .env            # must print .env
git diff --cached --name-only    # .env, .wrangler/, .live-check/ must not appear
git commit -m "ReceiveRight hackathon prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/receiveright.git
git push -u origin main
```

Never force-add environment files. If a secret is ever committed, revoke it; deleting it later does not remove it from history.

**License:** project code is under the [MIT License](LICENSE), copyright 2026 Kumar Abhinav. Third-party notices are retained in `build/sites-vite-plugin.LICENSE` and `vendor/`.

## Website and deployment

Hosted workspace (owner sign-in required, not a public judge demo): https://receiveright.abhinav-0905.chatgpt.site. Local changes do not deploy there.

Production authentication trusts identity headers from the Sites gateway. Do not expose the compiled Worker directly on a public URL without a trusted authentication boundary. `wrangler.local.json` is only for local migrations (placeholder database ID). Never upload `node_modules`, `.wrangler`, `.env`, `.sites-runtime` or the whole working folder as a deployment artifact.

## Troubleshooting

- **Please sign in:** use `pnpm dev` and the same hostname; click the sign-in button.
- **No such table:** stop the server, run `pnpm setup:local`, restart.
- **Port in use:** stop the other server, or run `pnpm dev --port 5174` and use that port everywhere (including `pnpm mcp:smoke -- --base http://localhost:5174`).
- **Setup needed after editing `.env`:** restart the server; all three values must be non-empty; remove any `.dev.vars`.
- **"The Amazon Bedrock API key has expired":** generate a new key, update `.env`, restart.
- **"must be called through an inference profile":** use `us.anthropic.claude-haiku-5-5` (or another profile ID), restart.
- **Denied access / model access:** check the key's region and its permission for the model or profile.
- **Throttled / timed out:** wait and send again yourself; requests are never retried automatically.
- **Dictation stopped or unavailable:** your text is kept; press the microphone to resume or type. Allow microphone access in the browser's site settings. Dictation needs a secure context (localhost is fine) and a supporting browser.
- **`pnpm install` fails with UNABLE_TO_GET_ISSUER_CERT_LOCALLY:** a `cafile` in `~/.npmrc` that contains only company certificates replaces the default roots. Remove it (keep `NODE_EXTRA_CA_CERTS`) or point it at a bundle that includes public roots.

See [product behavior and limits](RECEIVERIGHT.md), [Bedrock setup](docs/bedrock-setup.md) and [the review handoff](docs/REVIEW_HANDOFF.md).
