import type { ModelCall, ModelMessage } from "./receiving-agent.ts";

export type BedrockEnvironment = { AWS_BEARER_TOKEN_BEDROCK?: string; AWS_REGION?: string; BEDROCK_MODEL_ID?: string };
// Stable, non-secret failure categories shared by the API routes and the UI status.
export type ProviderFailure = "configuration" | "expired_credentials" | "access_denied" | "model_access" | "model_configuration" | "model_unsupported" | "throttled" | "timeout" | "unreachable" | "provider_error" | "invalid_response";
export class AgentServiceError extends Error {
  status: number;
  category: ProviderFailure;
  /** Provider HTTP status and AWS error type, for server logs only. Never sent to the browser. */
  diagnostic: string;
  constructor(message: string, status = 502, category: ProviderFailure = "provider_error", diagnostic = "") {
    super(message); this.status = status; this.category = category; this.diagnostic = diagnostic;
  }
}
export function bedrockStatus(env: BedrockEnvironment) {
  const missing = (["AWS_BEARER_TOKEN_BEDROCK", "AWS_REGION", "BEDROCK_MODEL_ID"] as const).filter(key => !env[key]?.trim());
  // Region and model ID are not secrets; the API key is never returned.
  return { provider: "Amazon Bedrock", configured: missing.length === 0, missing, region: env.AWS_REGION?.trim() || null, model: env.BEDROCK_MODEL_ID?.trim() || null };
}

// Map a failed Converse response to a fixed, actionable message. The provider body is read
// only to choose the category; it is never returned or logged because it can contain account details.
async function providerFailure(response: Response): Promise<AgentServiceError> {
  const detail = (await response.text().catch(() => "")).slice(0, 2000);
  const errorType = (response.headers.get("x-amzn-errortype") ?? "").split(":")[0].replace(/[^A-Za-z]/g, "").slice(0, 60);
  const diagnostic = `Bedrock HTTP ${response.status}${errorType ? ` ${errorType}` : ""}`;
  const fail = (message: string, status: number, category: ProviderFailure) => new AgentServiceError(message, status, category, diagnostic);
  if (response.status === 401 || response.status === 403) {
    if (/expired/i.test(detail)) return fail("The Amazon Bedrock API key has expired. Generate a new key, update AWS_BEARER_TOKEN_BEDROCK in .env and restart the server. Your draft was not changed.", 502, "expired_credentials");
    if (/access to the model|not authorized to (perform|access)|model access/i.test(detail)) return fail("This Bedrock API key cannot use the configured model. Check model access and permissions for BEDROCK_MODEL_ID in this region. Your draft was not changed.", 502, "model_access");
    return fail("Amazon Bedrock denied access. Check the server API key, its expiry and its permission to invoke this model. Your draft was not changed.", 502, "access_denied");
  }
  if (response.status === 429) return fail("Amazon Bedrock is throttling requests or the quota was reached. Wait a moment, then send your message again. Your draft was not changed.", 429, "throttled");
  if (response.status === 408) return fail("Amazon Bedrock did not answer in time. Your draft was not changed. Try a shorter request.", 504, "timeout");
  if (response.status === 400 || response.status === 404) {
    if (/use case|access to the model|model access|not (been )?(enabled|subscribed)|legacy/i.test(detail)) return fail("This AWS account cannot use the configured model yet. Check model access in the Bedrock console (some Anthropic models need a one-time use-case form) for BEDROCK_MODEL_ID in this region.", 502, "model_access");
    if (/inference profile/i.test(detail)) return fail("This Bedrock model must be called through an inference profile. Set BEDROCK_MODEL_ID to the profile ID (for example us.anthropic.claude-haiku-5-5) and restart the server.", 502, "model_configuration");
    if (response.status === 404 || /model identifier|tool|converse|not supported|doesn.t support|does not support/i.test(detail)) return fail("Check that the configured Bedrock model supports Converse tool use in the selected region.", 502, "model_unsupported");
    return fail("Amazon Bedrock rejected this request. Your draft was not changed. If it keeps happening, start a new conversation.", 502, "provider_error");
  }
  return fail("Amazon Bedrock could not complete this request. Your draft was not changed.", 502, "provider_error");
}

export function createBedrockModel(env: BedrockEnvironment, fetcher: typeof fetch = fetch): ModelCall {
  if (!bedrockStatus(env).configured) throw new AgentServiceError("The AI assistant needs its server-side Amazon Bedrock configuration. Manual receiving still works.", 503, "configuration");
  const region = env.AWS_REGION!.trim();
  if (!/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(region) || region.startsWith("cn-")) throw new AgentServiceError("The configured AWS region is not supported by this connection.", 503, "configuration");
  const modelId = env.BEDROCK_MODEL_ID!.trim();
  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
  const deadline = Date.now() + 55000;
  return async ({ system, messages, tools }) => {
    const remaining = deadline - Date.now();
    if (remaining < 1000) throw new AgentServiceError("The assistant took too long. Your draft was not changed. Try a shorter request.", 504, "timeout");
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        // Workers supports manual/follow here. Never follow a redirect with credentials.
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(Math.min(20000, remaining)),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK!.trim()}` },
        body: JSON.stringify({
          system: [{ text: system }], messages,
          inferenceConfig: { maxTokens: 1400 },
          toolConfig: { tools: tools.map(t => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema } } })) },
        }),
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
      throw timedOut
        ? new AgentServiceError("Amazon Bedrock did not answer in time. Your draft was not changed.", 504, "timeout", "Bedrock request timed out")
        : new AgentServiceError("Amazon Bedrock could not be reached. Check the network connection. Your draft was not changed.", 502, "unreachable", "Bedrock network error");
    }
    // Never return the provider's raw error body: it can contain account or request details.
    if (!response.ok) throw await providerFailure(response);
    let body: string;
    try { body = await response.text(); }
    catch (cause) {
      const timedOut = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
      throw new AgentServiceError(timedOut ? "Amazon Bedrock did not answer in time. Your draft was not changed." : "Amazon Bedrock's response was interrupted. Your draft was not changed.", timedOut ? 504 : 502, timedOut ? "timeout" : "unreachable", "Bedrock response body failed");
    }
    if (body.length > 200000) throw new AgentServiceError("Amazon Bedrock returned an oversized response.", 502, "invalid_response");
    let data: { output?: { message?: ModelMessage }; stopReason?: string };
    try { data = JSON.parse(body); } catch { throw new AgentServiceError("Amazon Bedrock returned an unreadable response.", 502, "invalid_response"); }
    if (!data.output?.message || typeof data.stopReason !== "string") throw new AgentServiceError("Amazon Bedrock returned an incomplete response.", 502, "invalid_response");
    return { message: data.output.message, stopReason: data.stopReason };
  };
}

/**
 * One small live Converse request with the same tool configuration the assistant uses.
 * It reads and changes no receiving data. Success means this request worked now; it does
 * not prove the key will still be valid later.
 */
export async function testBedrockConnection(env: BedrockEnvironment, tools: Parameters<ModelCall>[0]["tools"], fetcher: typeof fetch = fetch) {
  const model = createBedrockModel(env, fetcher);
  const response = await model({
    system: "Connection test for a receiving assistant. Do not call any tool. Reply with the single word OK.",
    messages: [{ role: "user", content: [{ text: "Connection test" }] }],
    tools,
  });
  return { stopReason: response.stopReason };
}
