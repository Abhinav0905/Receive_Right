import { getChatGPTUser } from "../../chatgpt-auth";
import { callTool } from "../../../lib/store";
import { toolDefinitions } from "../../../lib/tool-definitions";

const headers = { "Cache-Control": "private, no-store" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });

// Browser sessions use website sign-in. /mcp remains the agent endpoint,
// which can require a separate OAuth flow at the hosting gateway.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return failure("Origin not allowed", 403);
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required", signInUrl: "/signin-with-chatgpt?return_to=%2F" }, { status: 401, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("JSON request required", 415);
  if (Number(request.headers.get("content-length") ?? 0) > 65536) return failure("Request too large", 413);
  const text = await request.text();
  if (text.length > 65536) return failure("Request too large", 413);
  let input: { name?: string; arguments?: Record<string, unknown> };
  try { input = JSON.parse(text); } catch { return failure("Invalid JSON request", 400); }
  if (!input || !toolDefinitions.some(t => t.name === input.name)) return failure("Unknown receiving operation", 400);
  try {
    return Response.json(await callTool(user.userId, input.name!, input.arguments ?? {}), { headers });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unable to complete this operation.";
    return failure(message.includes("D1_") ? "Storage is unavailable. Please try again." : message, 400);
  }
}
