import { getChatGPTUser } from "../chatgpt-auth";
import { callTool } from "../../lib/store";
import { toolDefinitions } from "../../lib/tool-definitions";

// server/discover lists 2026-07-28 for the hosting platform's discovery. initialize implements only the
// 2025-11-25 lifecycle (2026-07-28 has no initialize), so it never negotiates the newer revision.
const versions = ["2026-07-28", "2025-11-25"];
const initializeVersions = ["2025-11-25"];
// Review tokens reach an MCP client only from preview_receipt, so a client cannot confirm a draft
// that a person reviewed elsewhere (for example in the web UI) without preparing its own review.
type ToolOutput = { workspace?: { drafts?: Record<string, unknown>[] } };
function withoutDraftTokens(output: unknown) {
  const value = output as ToolOutput;
  if (!value?.workspace?.drafts) return output;
  return { ...value, workspace: { ...value.workspace, drafts: value.workspace.drafts.map(draft => { const copy = { ...draft }; delete copy.token; return copy; }) } };
}
export async function GET() { return new Response(null, { status: 405, headers: { Allow: "POST" } }); }
export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return new Response("Origin not allowed", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 65536) return new Response("Request too large", { status: 413 });
  const text = await request.text();
  if (text.length > 65536) return new Response("Request too large", { status: 413 });
  let message;
  try { message = JSON.parse(text); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: message.id, result }, { headers: { "Cache-Control": "no-store" } });
  const error = (code: number, value: string) => Response.json({ jsonrpc: "2.0", id: message?.id ?? null, error: { code, message: value } }, { status: 400 });
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string" || Array.isArray(message)) return error(-32600, "Invalid request");
  const user = await getChatGPTUser();
  if (!user) return new Response("Sign in to ReceiveRight to use this workspace.", { status: 401 });
  const protocol = request.headers.get("MCP-Protocol-Version");
  if (protocol && !versions.includes(protocol)) return error(-32600, "Unsupported MCP protocol version");
  if (message.method.startsWith("notifications/")) return new Response(null, { status: 202 });
  // JSON-RPC request ids must be a string or a number; MCP does not allow null.
  if (!("id" in message) || (typeof message.id !== "string" && typeof message.id !== "number")) return error(-32600, "Request id must be a string or number");
  if (message.method === "server/discover") return reply({ serverInfo: { name: "ReceiveRight", version: "0.1.0" }, supportedVersions: versions, capabilities: { tools: {} } });
  if (message.method === "initialize") return reply({ protocolVersion: initializeVersions.includes(message.params?.protocolVersion) ? message.params.protocolVersion : "2025-11-25", serverInfo: { name: "ReceiveRight", version: "0.1.0" }, capabilities: { tools: {} }, instructions: "Receiving assistant for small businesses. Received includes damaged goods. Review exact counts and obtain explicit user confirmation before saving a receipt. No messages are ever sent." });
  if (message.method === "ping") return reply({});
  if (message.method === "tools/list") return reply({ tools: toolDefinitions });
  if (message.method === "tools/call") {
    if (!toolDefinitions.some(t => t.name === message.params?.name)) return error(-32602, "Unknown tool");
    try {
      const output = await callTool(user.userId, message.params.name, message.params.arguments ?? {});
      return reply({ content: [{ type: "text", text: JSON.stringify(withoutDraftTokens(output)) }], isError: false });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to complete this operation.";
      // Operational errors are useful to a tool caller; no stack or credentials are returned.
      return reply({ content: [{ type: "text", text: message.includes("D1_") ? "Storage is unavailable. Please try again." : message }], isError: true });
    }
  }
  return error(-32601, "Method not found");
}
