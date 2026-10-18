// Minimal MCP client for the Streamable HTTP transport (protocol 2025-11-25).
// Every call is a real HTTP POST to an MCP endpoint. It is used by the browser integration panel,
// the `pnpm mcp:smoke` script and the compiled-Worker test, so all three exercise the same transport code.
// No credentials are handled here: the caller's fetch decides what authentication travels with the request.

export const MCP_PROTOCOL_VERSION = "2025-11-25";
/** Versions whose wire format this client implements. The server's answer must be one of these. */
export const MCP_SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18"];

export type JsonRpcId = number;
export type McpTraceEntry = {
  step: number;
  method: string;
  kind: "request" | "notification";
  /** How the request travelled, as labelled by the caller (default "HTTP POST <endpoint>"). */
  transport: string;
  id: JsonRpcId | null;
  httpStatus: number | null;
  contentType: string | null;
  durationMs: number;
  ok: boolean;
  requestHeaders: Record<string, string>;
  request: unknown;
  response: unknown;
  error?: string;
};
export type McpTool = { name: string; description?: string; inputSchema?: unknown; annotations?: Record<string, unknown> };
export type InitializeResult = { protocolVersion: string; serverInfo?: { name?: string; version?: string }; capabilities?: Record<string, unknown>; instructions?: string };
export type ToolCallResult = { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean };

export class McpError extends Error {
  code: number | null;
  httpStatus: number | null;
  constructor(message: string, code: number | null = null, httpStatus: number | null = null) {
    super(message); this.name = "McpError"; this.code = code; this.httpStatus = httpStatus;
  }
}

export type McpClientOptions = {
  /** Fixed MCP endpoint, e.g. "/mcp" in the browser or "http://localhost:5173/mcp" in Node. */
  endpoint: string;
  fetch?: typeof fetch;
  /** Extra request headers chosen by the caller (for example the loopback development sign-in cookie in Node). Never traced. */
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  clientInfo?: { name: string; version: string };
  onTrace?: (entry: McpTraceEntry) => void;
  now?: () => number;
  /** Label recorded in the trace, e.g. "HTTP POST /mcp (browser fetch)". Defaults to "HTTP POST <endpoint>". */
  transportLabel?: string;
};

const REDACTED = "[redacted]";
// Any key that names a credential, token, session or identity is replaced, whatever its exact spelling.
const SECRET_KEYS = /token|secret|authorization|cookie|api[-_]?key|password|email|session|^owner(id)?$|^userid$|^oai-/i;

/**
 * Sanitize a value for display: confirmation tokens, credentials and identity fields are replaced,
 * free-text notes and photo names are omitted, and whole workspaces are reduced to counts.
 * JSON carried inside text content blocks is parsed so the same rules apply to it.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return "…";
  if (typeof value === "string") {
    if (/^\s*[{[]/.test(value)) { try { return redact(JSON.parse(value), depth + 1); } catch { /* plain text */ } }
    return value.length > 600 ? `${value.slice(0, 600)}… (${value.length} chars)` : value;
  }
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => {
      if (SECRET_KEYS.test(k)) return [k, REDACTED];
      if (k === "note" && typeof v === "string") return [k, v ? "[note omitted]" : ""];
      if (k === "evidence" && Array.isArray(v)) return [k, `[${v.length} photo(s) omitted]`];
      if (k === "workspace" && v && typeof v === "object" && Array.isArray((v as { orders?: unknown }).orders)) {
        const w = v as { orders: unknown[]; drafts?: unknown[]; receipts?: unknown[] };
        return [k, { orders: w.orders.length, drafts: w.drafts?.length ?? 0, receipts: w.receipts?.length ?? 0, details: "omitted from trace" }];
      }
      if (k === "tools" && Array.isArray(v)) return [k, v.map(t => (t && typeof t === "object" && "name" in t ? (t as { name: unknown }).name : t))];
      return [k, redact(v, depth + 1)];
    }));
  }
  return value;
}

/** Tool results from this server carry JSON in a text content block; parse it when possible. */
export function toolResultJson<T = unknown>(result: ToolCallResult): T | undefined {
  if (result.structuredContent !== undefined) return result.structuredContent as T;
  const text = result.content?.find(c => c.type === "text")?.text;
  if (text === undefined) return undefined;
  try { return JSON.parse(text) as T; } catch { return undefined; }
}

/** Parse a text/event-stream body into JSON-RPC messages, ignoring priming events with empty data. */
export function parseSseMessages(body: string): unknown[] {
  const messages: unknown[] = [];
  for (const block of body.replace(/\r\n?/g, "\n").split("\n\n")) {
    const data = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n");
    if (!data.trim()) continue;
    try { messages.push(JSON.parse(data)); } catch { throw new McpError("The server sent an unreadable event-stream message."); }
  }
  return messages;
}

export function createMcpClient(options: McpClientOptions) {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const clientInfo = options.clientInfo ?? { name: "receiveright-mcp-check", version: "0.2.0" };
  let nextId = 1;
  let step = 0;
  let negotiatedVersion: string | null = null;
  let sessionId: string | null = null;

  function headersFor() {
    const traced: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (negotiatedVersion) traced["MCP-Protocol-Version"] = negotiatedVersion;
    if (sessionId) traced["Mcp-Session-Id"] = sessionId;
    return traced;
  }

  async function send(method: string, params: Record<string, unknown> | undefined, kind: "request" | "notification") {
    const id = kind === "request" ? nextId++ : null;
    const message = { jsonrpc: "2.0", ...(id !== null ? { id } : {}), method, ...(params ? { params } : {}) };
    const traced = headersFor();
    const entry: McpTraceEntry = {
      step: ++step, method: method === "tools/call" && params?.name ? `tools/call · ${String(params.name)}` : method, kind, transport: options.transportLabel ?? `HTTP POST ${options.endpoint}`, id, httpStatus: null, contentType: null, durationMs: 0, ok: false,
      requestHeaders: { ...traced, ...(traced["Mcp-Session-Id"] ? { "Mcp-Session-Id": REDACTED } : {}), ...(options.headers || options.credentials ? { Cookie: "[session cookie sent with the request, redacted]" } : {}) },
      request: redact(message), response: null,
    };
    const started = now();
    try {
      let response: Response;
      try {
        response = await doFetch(options.endpoint, { method: "POST", headers: { ...traced, ...options.headers }, body: JSON.stringify(message), credentials: options.credentials, redirect: "manual" });
      } catch (cause) {
        throw new McpError(`Network error: ${cause instanceof Error ? cause.message : "request failed"}`);
      }
      entry.httpStatus = response.status;
      entry.contentType = response.headers.get("content-type");
      const body = await response.text();
      entry.durationMs = Math.round(now() - started);
      if (method === "initialize") sessionId = response.headers.get("mcp-session-id") ?? sessionId;
      if (kind === "notification") {
        entry.response = body ? redact(body) : "(no body)";
        // The transport requires 202 Accepted for an accepted notification; anything else was not accepted.
        if (response.status !== 202) throw new McpError(`HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""} (expected 202 Accepted)`, null, response.status);
        entry.ok = true;
        return undefined;
      }
      let payload: unknown = undefined;
      if (entry.contentType?.includes("text/event-stream")) {
        const messages = parseSseMessages(body) as Record<string, unknown>[];
        // Only a response (result or error, no method) answers this request; server requests may reuse ids.
        payload = messages.find(m => m && typeof m === "object" && m.id === id && !("method" in m) && ("result" in m || "error" in m));
        if (payload === undefined) throw new McpError("The event stream closed before the response arrived. This minimal client does not resume streams.", null, response.status);
      } else if (body) {
        try { payload = JSON.parse(body); } catch { payload = undefined; }
      }
      entry.response = redact(payload ?? body);
      if (response.status === 401 || response.status === 403) throw new McpError(`HTTP ${response.status}: ${(typeof payload === "object" ? "" : body).slice(0, 200) || "not authorized"}`, null, response.status);
      const rpc = payload as { jsonrpc?: string; id?: unknown; result?: unknown; error?: { code?: number; message?: string } } | undefined;
      if (!rpc || rpc.jsonrpc !== "2.0") throw new McpError(`HTTP ${response.status}: the response was not JSON-RPC 2.0`, null, response.status);
      if (rpc.error) throw new McpError(`JSON-RPC error ${rpc.error.code ?? ""}: ${rpc.error.message ?? "unknown"}`, rpc.error.code ?? null, response.status);
      if (rpc.id !== id) throw new McpError(`Response id ${JSON.stringify(rpc.id)} does not match request id ${id}`, null, response.status);
      if (!response.ok) throw new McpError(`HTTP ${response.status}`, null, response.status);
      entry.ok = true;
      return rpc.result;
    } catch (cause) {
      entry.durationMs ||= Math.round(now() - started);
      entry.error = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      options.onTrace?.(entry);
    }
  }

  return {
    get negotiatedVersion() { return negotiatedVersion; },
    get sessionId() { return sessionId; },
    /** initialize, then notifications/initialized, as the lifecycle requires. */
    async connect(): Promise<InitializeResult> {
      const result = await send("initialize", { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo }, "request") as InitializeResult;
      if (!result || typeof result.protocolVersion !== "string") throw new McpError("initialize returned no protocolVersion");
      if (!MCP_SUPPORTED_VERSIONS.includes(result.protocolVersion)) throw new McpError(`The server negotiated protocol ${result.protocolVersion}, which this client does not support.`);
      negotiatedVersion = result.protocolVersion;
      await send("notifications/initialized", undefined, "notification");
      return result;
    },
    async listTools(): Promise<McpTool[]> {
      if (!negotiatedVersion) throw new McpError("Call connect() first.");
      const result = await send("tools/list", {}, "request") as { tools?: McpTool[] };
      if (!Array.isArray(result?.tools)) throw new McpError("tools/list returned no tools array");
      return result.tools;
    },
    async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
      if (!negotiatedVersion) throw new McpError("Call connect() first.");
      return await send("tools/call", { name, arguments: args }, "request") as ToolCallResult;
    },
    /** Send an arbitrary message, for protocol tests only. */
    async raw(method: string, params?: Record<string, unknown>, kind: "request" | "notification" = "request") { return send(method, params, kind); },
  };
}
export type McpClient = ReturnType<typeof createMcpClient>;
