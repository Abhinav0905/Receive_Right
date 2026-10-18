// Shared MCP verification flows used by the integration panel and `pnpm mcp:smoke`.
// Each step is a real tools/call over the transport in mcp-client.ts; nothing here touches storage directly.
import { McpError, toolResultJson, type McpClient, type McpTool } from "./mcp-client.ts";
import type { Draft, LineSummary, Order, Workspace } from "./receiving.ts";

type ToolOutput<T> = { workspace: Workspace; result: T };

export function workspaceCounts(workspace: Workspace) {
  return { orders: workspace.orders.length, drafts: workspace.drafts.length, receipts: workspace.receipts.length };
}

// Key-order independent comparison, so equal data serialized differently still matches.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as object).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
// MCP output withholds stored review tokens by design, so they are left out of the comparison.
const withoutTokens = (w: Workspace) => ({ ...w, drafts: w.drafts.map(d => { const copy = { ...d }; delete copy.token; return copy; }) });
export function sameWorkspace(a: Workspace, b: Workspace) { return stable(withoutTokens(a)) === stable(withoutTokens(b)); }

async function callJson<T>(client: McpClient, name: string, args: Record<string, unknown> = {}): Promise<ToolOutput<T>> {
  const result = await client.callTool(name, args);
  const text = result.content?.find(c => c.type === "text")?.text ?? "";
  if (result.isError) throw new McpError(`${name} returned a tool error: ${text.slice(0, 200)}`);
  const output = toolResultJson<ToolOutput<T>>(result);
  if (!output?.workspace) throw new McpError(`${name} returned an unexpected result`);
  return output;
}

export type McpCheckResult = {
  protocolVersion: string;
  server: string;
  tools: string[];
  counts: ReturnType<typeof workspaceCounts>;
  /** null when no comparison source was supplied or it could not be read. */
  matchesReceivingView: boolean | null;
  workspace: Workspace;
};

/** Read-only check: initialize -> notifications/initialized -> tools/list -> tools/call get_workspace. */
export async function runMcpCheck(client: McpClient, receivingView?: () => Promise<Workspace | null>): Promise<McpCheckResult> {
  const init = await client.connect();
  const tools: McpTool[] = await client.listTools();
  const { workspace } = await callJson<null>(client, "get_workspace");
  // The receiving view is fetched after the MCP read so both reflect the same moment.
  const view = receivingView ? await receivingView() : null;
  return {
    protocolVersion: init.protocolVersion,
    server: `${init.serverInfo?.name ?? "unknown"} ${init.serverInfo?.version ?? ""}`.trim(),
    tools: tools.map(t => t.name),
    counts: workspaceCounts(workspace),
    matchesReceivingView: view ? sameWorkspace(workspace, view) : null,
    workspace,
  };
}

export type McpDraftResult = { order: string; draftCounts: { received: number; damaged: number }; totals: Pick<LineSummary, "name" | "unit" | "ordered" | "received" | "damaged" | "accepted" | "missing">[]; reviewPrepared: boolean };

/**
 * Explicit, state-changing demonstration on the dedicated DEMO-MCP-CHECK order:
 * create_demo_order (protocol-check) -> start_receiving -> record_received_items -> preview_receipt.
 * It prepares a draft and a review. It never calls confirm_receipt.
 */
export async function runMcpDraftPreview(client: McpClient): Promise<McpDraftResult> {
  if (!client.negotiatedVersion) await client.connect();
  const { result: order } = await callJson<Order>(client, "create_demo_order", { purpose: "protocol-check" });
  const { result: draft } = await callJson<Draft>(client, "start_receiving", { orderId: order.id });
  await callJson(client, "record_received_items", { draftId: draft.id, lineId: order.lines[0].id, received: 3, damaged: 1 });
  const { result: review } = await callJson<{ token: string; totals: LineSummary[] }>(client, "preview_receipt", { draftId: draft.id });
  return {
    order: order.reference,
    draftCounts: { received: 3, damaged: 1 },
    totals: review.totals.map(({ name, unit, ordered, received, damaged, accepted, missing }) => ({ name, unit, ordered, received, damaged, accepted, missing })),
    reviewPrepared: typeof review.token === "string" && review.token.length > 0,
  };
}
