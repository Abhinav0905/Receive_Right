# Export verification: October 17, 2026

> Historical record of the original source export. Current verification (live Bedrock, MCP client, dictation, browser checks) is in [REVIEW_HANDOFF.md](REVIEW_HANDOFF.md).

Environment: Linux, Node 24.19.0, pnpm 11.25.0. Source exported from hosted commit 2a5404c88ac9ac653a35ba96bcb416bf025d5616, with local setup and handoff additions.

Passed:

- Fresh dependency directory installed from the available package cache using the frozen pnpm lockfile.
- TypeScript check and all 20 domain/agent tests.
- Portable production build using Vinext.
- Compiled Worker receiving/auth/MCP/D1/R2 integration suite.
- Compiled Worker conversational route with fixture Bedrock responses: staged tool operations, commit, rollback, concurrent-edit protection and owner isolation.
- Local database migration, then a repeat setup with no pending migrations and existing .env preserved.
- Local sign-in middleware: redirect/cookie, identity forwarding, forged-header removal and loopback-only access.
- Cloudflare's development environment loader reads the three configured settings from .env.
- A dummy credential marker was absent from all production build files after a configured build.
- Git ignore rules exclude local settings/state and include the empty .env.example.

Limits:

- Interactive browser verification of this export could not complete: the supervised preview reported running, but its URL refused connections. No claim of a successful exported-app browser session is made.
- No live AWS request was made. Model behavior, account access and real Converse tool use still require the user's local configuration and acceptance tests.
- No Alexa hardware, Ring, Amazon shopping-history or general Alexa OAuth integration was verified.
- Windows/macOS, a fresh online registry download and browser microphone behavior were not tested here.
- Tests used isolated fixture data; the hosted owner's receipts and photos were not exported or modified.
