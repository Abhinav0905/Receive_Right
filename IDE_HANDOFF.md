# ReceiveRight: continuation context for VS Code

> **Update, October 18, 2026:** the live Bedrock test, MCP client verification, dictation fixes, demo runs and submission documents described below as next steps have since been done. Start with [docs/REVIEW_HANDOFF.md](docs/REVIEW_HANDOFF.md); this file is kept as the original handoff.

This is a local source export prepared October 17, 2026 from hosted source commit `2a5404c88ac9ac653a35ba96bcb416bf025d5616`, with portable setup scripts, environment template and documentation added. The export does not change the deployed site. There is no Git history in the ZIP; initialize your own repository.

## Product goal

Build a convincing Alexa-oriented hackathon prototype for small-business receiving. A café employee describes a supplier delivery, the assistant matches it to an explicitly selected purchase order, records draft counts, flags shortages/damage and prepares a receipt for human confirmation. The demo is an independent web simulator. Do not describe it as connected to Alexa hardware, Ring, Amazon order history or automatic barcode/OCR extraction.

## Current state

- Website, browser receiving API, MCP tools, local/hosted persistence and photo evidence are implemented.
- Bedrock Converse adapter and staged agent tool loop are implemented, but no live AWS model test has been performed during this handoff. Provider tests use fixtures.
- The user will enter AWS_REGION, BEDROCK_MODEL_ID and AWS_BEARER_TOKEN_BEDROCK in ignored `.env` locally. Never print, commit, or ask them to paste the key into chat.
- Local development uses a loopback-only mock identity and local D1/R2 emulation. It is independent of the hosted owner's workspace.
- The website remains at https://receiveright.abhinav-0905.chatgpt.site and currently requires owner access. Local changes do not automatically deploy there.
- Existing hosted PO-1043 had 8 ordered and 1 confirmed received; 7 remained. The archive does not export live workspace data. Recreate this with local sample data if useful.

## First task after opening this folder

1. Read README.md, docs/bedrock-setup.md, lib/bedrock.ts and lib/receiving-agent.ts.
2. Follow the README setup, sign in locally and load sample orders.
3. Have the user configure `.env` on their machine. Confirm settings exist through GET /api/assistant while signed in; do not reveal values.
4. Make an intentional live Bedrock request from the UI. Verify model access and tool use, not just the configured status label.
5. Test shortage + damage, correction, ambiguous wording, a second delivery and a multi-line order. Check persisted records, not just assistant wording.
6. Preserve manual receiving and the explicit review/confirm step. Fix actual failures and rerun focused tests.
7. Record an honest demo and prepare judge access and GitHub submission details.

## Critical behavior

Received includes damaged goods: 12 ordered, 10 received including 1 damaged = 9 accepted, 1 damaged, 2 undelivered. A later 2-good-case receipt yields 11 accepted, 1 historic damaged, 0 undelivered. Each delivery adds once. Damage is not silently resolved by later deliveries.

The model may call only get_workspace, start_receiving, record_received_items, update_receiving_note, preview_receipt and draft_discrepancy_report for the selected order. It cannot confirm receipts, import/delete orders, send supplier messages or access another order. Counts are validated server-side. The full turn commits atomically using revision checking; a provider failure or concurrent edit leaves no partial AI changes. Confirmation uses a fresh review token and explicit user consent; edits invalidate tokens, and retries do not duplicate receipts.

Do not weaken authentication to make a public demo work. Hosted auth trusts a gateway; local mock auth is development-only. A generic public deployment must have a trusted authentication boundary. Photo attachments are evidence only and are private to their owner.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:worker
```

The test suites cover domain math, confirmation, access isolation, provider failure rollback, concurrent edit protection and real compiled Worker routes with fixture data. A passing fixture test is not evidence of real model accuracy or an Alexa integration.

## Conversation continuity

Do not assume this browser chat automatically appears in the IDE. Open Codex in VS Code and attach this file plus README.md. Suggested first prompt:

> Continue ReceiveRight from IDE_HANDOFF.md. First verify the local app starts. Then help me validate the existing Bedrock Converse integration using my local .env, without exposing credentials. Preserve explicit receipt confirmation and run the acceptance scenarios in docs/bedrock-setup.md. Report what you actually verified.
