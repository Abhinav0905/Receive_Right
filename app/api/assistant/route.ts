import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { bedrockStatus, createBedrockModel, AgentServiceError } from "../../../lib/bedrock";
import { agentInputSchema, runReceivingAgent } from "../../../lib/receiving-agent";
import { stageWorkspace, WorkspaceConflictError } from "../../../lib/store";

const headers = { "Cache-Control": "private, no-store" };
const failure = (error: string, status: number, category?: string) => Response.json(category ? { error, category } : { error }, { status, headers });
const signIn = () => Response.json({ error: "Sign in required", signInUrl: "/signin-with-chatgpt?return_to=%2F" }, { status: 401, headers });
export async function GET() {
  if (!await getChatGPTUser()) return signIn();
  return Response.json(bedrockStatus(env), { headers });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return failure("Origin not allowed", 403);
  const user = await getChatGPTUser();
  if (!user) return signIn();
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("JSON request required", 415);
  if (Number(request.headers.get("content-length") ?? 0) > 32000) return failure("Conversation is too long. Start a new conversation.", 413);
  const text = await request.text();
  if (text.length > 32000) return failure("Conversation is too long. Start a new conversation.", 413);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return failure("Invalid JSON request", 400); }
  const input = agentInputSchema.safeParse(raw);
  if (!input.success) return failure("Send a selected order and alternating user/assistant text messages, ending with your message.", 400);
  try {
    const model = createBedrockModel(env);
    const result = await stageWorkspace(user.userId, workspace => runReceivingAgent(workspace, input.data, model));
    return Response.json(result, { headers });
  } catch (cause) {
    if (cause instanceof WorkspaceConflictError) return failure(cause.message, 409, "conflict");
    if (cause instanceof AgentServiceError) {
      // Server-side diagnosis only: fixed category plus provider status/type, never the key or provider body.
      console.error(`[assistant] turn failed: ${cause.category}${cause.diagnostic ? ` (${cause.diagnostic})` : ""}`);
      return failure(cause.message, cause.status, cause.category);
    }
    if (cause instanceof Error && cause.message === "Purchase order not found.") return failure(cause.message, 404);
    console.error(`[assistant] turn failed: agent_error (${cause instanceof Error ? cause.message.slice(0, 200) : "unknown"})`);
    return failure("The assistant could not finish this turn. No draft changes from this turn were saved. You can continue receiving manually.", 502, "agent_error");
  }
}
