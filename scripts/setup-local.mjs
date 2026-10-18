import { copyFileSync, constants, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./sites-env.mjs";
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) throw new Error("Install Node.js 24, then run setup again.");
if (!existsSync("node_modules/wrangler/bin/wrangler.js")) {
  throw new Error("Run pnpm install --frozen-lockfile before setup.");
}
try {
  copyFileSync(".env.example", ".env", constants.COPYFILE_EXCL);
  console.log("Created .env with empty Bedrock settings. Your values stay local.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Kept your existing .env unchanged.");
}
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("./migrate-local.mjs", import.meta.url)),
], { cwd: projectRoot, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Ready. Run pnpm dev and open http://localhost:5173.");
console.log("Use the sign-in button for the local demo identity, then Load sample orders.");
console.log("For AI, fill the three AWS settings in .env and restart pnpm dev.");
