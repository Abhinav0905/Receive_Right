import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { AgentServiceError, bedrockStatus, testBedrockConnection } from "../../../../lib/bedrock";
import { agentTools } from "../../../../lib/receiving-agent";

const headers = { "Cache-Control": "private, no-store" };

// An explicit, user-initiated live request. It reads and changes no receiving data and is never retried.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origin not allowed" }, { status: 403, headers });
  if (!await getChatGPTUser()) return Response.json({ error: "Sign in required", signInUrl: "/signin-with-chatgpt?return_to=%2F" }, { status: 401, headers });
  const { model, region } = bedrockStatus(env);
  const started = Date.now();
  try {
    const { stopReason } = await testBedrockConnection(env, agentTools);
    return Response.json({ ok: true, testedAt: new Date().toISOString(), latencyMs: Date.now() - started, model, region, stopReason }, { headers });
  } catch (cause) {
    const known = cause instanceof AgentServiceError;
    console.error(`[assistant] connection test failed: ${known ? `${cause.category}${cause.diagnostic ? ` (${cause.diagnostic})` : ""}` : "unexpected error"}`);
    return Response.json({
      ok: false, testedAt: new Date().toISOString(), latencyMs: Date.now() - started, model, region,
      category: known ? cause.category : "provider_error",
      error: known ? cause.message : "The connection test could not be completed.",
    }, { status: known ? cause.status : 502, headers });
  }
}
