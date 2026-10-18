import { env } from "cloudflare:workers";
import { emptyWorkspace, executeTool, readOnlyTools, type Workspace, type ToolName, type Evidence } from "./receiving";

export class WorkspaceConflictError extends Error {}

// Stage a whole conversation turn, then commit once. Do not retry a model call
// on a revision conflict: a person may have edited or confirmed the draft meanwhile.
export async function stageWorkspace<T extends { workspace: Workspace; changed: boolean }>(owner: string, action: (workspace: Workspace) => Promise<T>): Promise<T> {
  if (!env.DB) throw new Error("Database is not configured.");
  const row = await env.DB.prepare("SELECT payload, revision FROM workspaces WHERE owner_id = ?").bind(owner).first<{ payload: string; revision: number }>();
  const result = await action(row ? JSON.parse(row.payload) : emptyWorkspace());
  if (!result.changed) return result;
  const payload = JSON.stringify(result.workspace);
  const write = row
    ? await env.DB.prepare("UPDATE workspaces SET payload = ?, revision = revision + 1 WHERE owner_id = ? AND revision = ?").bind(payload, owner, row.revision).run()
    : await env.DB.prepare("INSERT INTO workspaces (owner_id, revision, payload) VALUES (?, 1, ?) ON CONFLICT(owner_id) DO NOTHING").bind(owner, payload).run();
  if (write.meta.changes !== 1) throw new WorkspaceConflictError("This workspace changed during the conversation. Refresh and try again; the assistant's draft changes were not saved.");
  return result;
}

export async function callTool(owner: string, name: string, args: Record<string, unknown>) {
  if (!env.DB) throw new Error("Database is not configured.");
  let evidence: Evidence | undefined;
  if (name === "attach_evidence") {
    evidence = await env.DB.prepare("SELECT id, name FROM evidence WHERE id = ? AND owner_id = ?").bind(args.evidenceId, owner).first<Evidence>() ?? undefined;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await env.DB.prepare("SELECT payload, revision FROM workspaces WHERE owner_id = ?").bind(owner).first<{ payload: string; revision: number }>();
    const state: Workspace = row ? JSON.parse(row.payload) : emptyWorkspace();
    const output = executeTool(state, name, args, { evidence });
    if (readOnlyTools.has(name as ToolName)) return output;
    const serialized = JSON.stringify(output.workspace);
    const write = row
      ? await env.DB.prepare("UPDATE workspaces SET payload = ?, revision = revision + 1 WHERE owner_id = ? AND revision = ?").bind(serialized, owner, row.revision).run()
      : await env.DB.prepare("INSERT INTO workspaces (owner_id, revision, payload) VALUES (?, 1, ?) ON CONFLICT(owner_id) DO NOTHING").bind(owner, serialized).run();
    if (write.meta.changes === 1) return output;
  }
  throw new Error("Another receiving session changed this order. Please refresh and try again.");
}
