// Apply pending migrations to the local emulator only. No Cloudflare account needed.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import "./sites-env.mjs";
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
  "d1", "migrations", "apply", "DB", "--local", "--config", "wrangler.local.json",
  "--persist-to", ".wrangler/state",
], { stdio: "inherit", env: { ...process.env, CI: "true" } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
