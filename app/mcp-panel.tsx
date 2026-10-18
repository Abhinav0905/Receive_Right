"use client";
import { useState } from "react";
import { CheckCircle2, ClipboardList, LoaderCircle, Network, TriangleAlert } from "lucide-react";
import { createMcpClient, type McpTraceEntry } from "../lib/mcp-client";
import { runMcpCheck, runMcpDraftPreview, type McpCheckResult, type McpDraftResult } from "../lib/mcp-check";
import type { Workspace } from "../lib/receiving";

type Props = {
  /** Reads the workspace through the website API (/api/receiving), which is not MCP. Also refreshes the receiving view. */
  readReceivingView: () => Promise<Workspace>;
  disabled: boolean;
  /** Keeps the rest of the page (navigation, demo runs) disabled while a run is in flight. */
  onBusyChange: (busy: boolean) => void;
};
type Outcome = { at: string; ok: boolean; error?: string; check?: McpCheckResult; draft?: McpDraftResult; comparisonError?: string };

// A real MCP client in the browser: every step below is an HTTP POST to this site's /mcp endpoint,
// authenticated by the same website session cookie the browser already sends to this origin.
export default function McpPanel({ readReceivingView, disabled, onBusyChange }: Props) {
  const [running, setRunning] = useState<"check" | "draft" | null>(null);
  const [trace, setTrace] = useState<McpTraceEntry[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [viewRead, setViewRead] = useState<{ status: string; ms: number } | null>(null);

  async function run(kind: "check" | "draft") {
    if (running) return;
    setRunning(kind); onBusyChange(true); setTrace([]); setViewRead(null); setOutcome(null);
    const entries: McpTraceEntry[] = [];
    const client = createMcpClient({ endpoint: "/mcp", credentials: "same-origin", transportLabel: "HTTP POST /mcp (browser fetch)", clientInfo: { name: "receiveright-integration-panel", version: "0.2.0" }, onTrace: e => { entries.push(e); setTrace([...entries]); } });
    const timedView = async () => {
      const started = performance.now();
      try { const w = await readReceivingView(); setViewRead({ status: "HTTP POST /api/receiving · 200", ms: Math.round(performance.now() - started) }); return w; }
      catch (cause) { setViewRead({ status: "HTTP POST /api/receiving · failed", ms: Math.round(performance.now() - started) }); throw cause; }
    };
    // A failed website comparison read is reported separately; it is not an MCP failure.
    let comparisonError: string | undefined;
    const comparison = async () => { try { return await timedView(); } catch (cause) { comparisonError = cause instanceof Error ? cause.message : "The website read failed."; return null; } };
    try {
      if (kind === "check") {
        const check = await runMcpCheck(client, comparison);
        setOutcome({ at: new Date().toISOString(), ok: true, check, comparisonError });
      } else {
        const draft = await runMcpDraftPreview(client);
        await comparison();
        setOutcome({ at: new Date().toISOString(), ok: true, draft, comparisonError });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The MCP request failed.";
      setOutcome({ at: new Date().toISOString(), ok: false, error: message });
    } finally { setRunning(null); onBusyChange(false); }
  }

  const failedStep = trace.find(e => !e.ok);
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  return <section className="panel details-card mcp-panel" aria-labelledby="mcp-panel-title">
    <span className="eyebrow">MODEL CONTEXT PROTOCOL</span>
    <h3 id="mcp-panel-title">Check the MCP server with a real client.</h3>
    <p>This panel is an MCP client running in your browser. Each step is an HTTP request to this site&apos;s <code>/mcp</code> endpoint using the Streamable HTTP transport, signed in with your current website session. The Bedrock assistant does not use this path; it calls the same validated receiving operations directly on the server.</p>
    <div className="button-row">
      <button className="button secondary small" disabled={disabled || !!running} onClick={() => void run("check")}>{running === "check" ? <LoaderCircle size={15} className="spin" /> : <Network size={15} />}Run MCP check (read-only)</button>
      <button className="button secondary small" disabled={disabled || !!running} onClick={() => void run("draft")}>{running === "draft" ? <LoaderCircle size={15} className="spin" /> : <ClipboardList size={15} />}Prepare MCP demo draft</button>
    </div>
    <p className="fine-print">The demo draft uses <code>tools/call</code> on the fictional <strong>DEMO-MCP-CHECK</strong> order: it creates that order if needed, sets 3 received including 1 damaged, and prepares a review. It changes that draft. It never confirms a receipt.</p>
    <div className={`mcp-status ${outcome ? (outcome.ok ? "ok" : "failed") : ""}`} role="status" aria-live="polite">
      {running ? <><LoaderCircle size={16} className="spin" />Sending MCP requests…</>
        : !outcome ? <>Not checked yet. Status appears only after real requests.</>
        : outcome.ok ? <><CheckCircle2 size={16} />MCP responded at {time(outcome.at)}{outcome.check ? ` · protocol ${outcome.check.protocolVersion} · ${outcome.check.tools.length} tools` : outcome.draft ? ` · review prepared on ${outcome.draft.order}` : ""}</>
        : <><TriangleAlert size={16} />MCP check failed{failedStep ? ` at ${failedStep.method}` : ""}: {outcome.error}</>}
    </div>
    {outcome?.ok && outcome.check && <dl className="integration-status mcp-facts">
      <div><dt>Negotiated protocol</dt><dd>{outcome.check.protocolVersion}</dd></div>
      <div><dt>Server</dt><dd>{outcome.check.server}</dd></div>
      <div><dt>Tools discovered</dt><dd>{outcome.check.tools.length}: {outcome.check.tools.join(", ")}</dd></div>
      <div><dt>Workspace via MCP</dt><dd>{outcome.check.counts.orders} orders · {outcome.check.counts.drafts} drafts · {outcome.check.counts.receipts} receipts</dd></div>
      <div><dt>Matches receiving view</dt><dd className={`pill ${outcome.check.matchesReceivingView ? "green" : "amber"}`}>{outcome.check.matchesReceivingView === null ? `Not compared: ${outcome.comparisonError ?? "website read unavailable"}` : outcome.check.matchesReceivingView ? "Identical data (review tokens withheld from MCP)" : "Different — refresh and check again"}</dd></div>
    </dl>}
    {outcome?.ok && outcome.draft && <dl className="integration-status mcp-facts">
      <div><dt>Order</dt><dd>{outcome.draft.order} (fictional)</dd></div>
      {outcome.draft.totals.map(t => <div key={t.name}><dt>{t.name}</dt><dd>This draft: 3 received, 1 damaged · Order balance if confirmed: {t.accepted} accepted, {t.damaged} damaged, {t.missing} {t.unit} undelivered</dd></div>)}
      <div><dt>Review</dt><dd>Prepared; token withheld from this trace. Not confirmed.</dd></div>
      {outcome.comparisonError && <div><dt>Receiving view refresh</dt><dd className="amber-text">Failed: {outcome.comparisonError} (the MCP steps above succeeded)</dd></div>}
    </dl>}
    {trace.length > 0 && <details className="mcp-trace" open>
      <summary>Request trace ({trace.length} MCP HTTP requests{viewRead ? " + 1 website API read" : ""})</summary>
      <ol>{trace.map(e => <li key={e.step} className={e.ok ? "" : "amber-text"}>
        <span className="mcp-trace-row"><strong>{e.method}</strong><span>{e.transport} · HTTP {e.httpStatus ?? "—"} · {e.durationMs} ms{e.id !== null ? ` · id ${e.id}` : " · notification"}</span></span>
        {e.error && <span>Error: {e.error}</span>}
        <details><summary>Sanitized request and response</summary><pre>{JSON.stringify({ headers: e.requestHeaders, request: e.request, response: e.response }, null, 2)}</pre></details>
      </li>)}
        {viewRead && <li><span className="mcp-trace-row"><strong>receiving view (comparison)</strong><span>{viewRead.status} · {viewRead.ms} ms · website API, not MCP</span></span></li>}
      </ol>
      <p className="fine-print">Cookies, identity headers, confirmation tokens, notes and photo names are removed. Durations are measured in this browser against this server and say nothing about a public deployment.</p>
    </details>}
    <p className="fine-print">Hosting note: locally, <code>pnpm dev</code> signs this browser in for both the website and <code>/mcp</code>. On the hosted Sites deployment, <code>/mcp</code> is authenticated by the hosting gateway for connector clients, so this browser panel may receive 401 there. That limit is documented rather than bypassed.</p>
  </section>;
}
