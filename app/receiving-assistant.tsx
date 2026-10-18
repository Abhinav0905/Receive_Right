"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, ClipboardCheck, FileText, Info, LoaderCircle, Mic, PlugZap, RefreshCw, Send, Square, Volume2 } from "lucide-react";
import type { Order, Workspace } from "../lib/receiving";
import type { AgentResult, AgentTrace, ChatMessage } from "../lib/receiving-agent";
import { speakText, unavailableText } from "../lib/dictation";
import { useDictation } from "../hooks/use-dictation";
import { describeStatus, loadAssistantStatus, recordAssistantResult, testAssistantConnection, useAssistantStatus } from "../hooks/use-assistant-status";

type Props = { order: Order; busy: boolean; hasDraft: boolean; onBusy: (value: boolean) => void; onWorkspace: (workspace: Workspace) => void; onRefresh: () => Promise<void>; onSignIn: () => void; onReview: () => void; onReport: (report: string) => void };
const labels: Record<string, string> = { get_workspace: "Read order", start_receiving: "Open draft", record_received_items: "Update counts", update_receiving_note: "Update note", preview_receipt: "Prepare review", draft_discrepancy_report: "Draft supplier report", unavailable_action: "Action blocked" };
// Failures that describe the AI provider. Conflicts and request validation are not provider results.
const providerCategories = new Set(["configuration", "expired_credentials", "access_denied", "model_access", "model_configuration", "model_unsupported", "throttled", "timeout", "unreachable", "provider_error", "invalid_response", "agent_error"]);

export default function ReceivingAssistant({ order, busy, hasDraft, onBusy, onWorkspace, onRefresh, onSignIn, onReview, onReport }: Props) {
  const assistant = useAssistantStatus();
  const status = assistant.status;
  const shown = describeStatus(assistant);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [trace, setTrace] = useState<AgentTrace[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation(useCallback((value: string) => setText(value), []));
  const dictating = dictation.active;

  useEffect(() => { void loadAssistantStatus(); }, []);
  useEffect(() => { if (assistant.signInRequired) onSignIn(); }, [assistant.signInRequired, onSignIn]);
  useEffect(() => { if (messages.length) end.current?.scrollIntoView({ behavior: "auto", block: "nearest" }); }, [messages]);

  async function send() {
    const value = text.trim();
    // Dictation must be stopped first, so no late recognition result can change a message after it was sent.
    if (!value || busy || dictating || inFlight.current || !status?.configured) return;
    if (messages.length >= 14) { setError("Start a new conversation to continue. Your orders and receipts will remain saved."); return; }
    inFlight.current = true; onBusy(true); setSending(true); setError(""); setTrace([]); setReport(null);
    const next: ChatMessage[] = [...messages, { role: "user", text: value }];
    const started = performance.now();
    try {
      const response = await fetch("/api/assistant", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ orderId: order.id, messages: next }) });
      if (response.status === 401 || response.redirected) { onSignIn(); throw new Error("Please sign in again."); }
      const data = await response.json() as AgentResult & { error?: string; category?: string };
      if (!response.ok) {
        if (data.category && providerCategories.has(data.category)) recordAssistantResult({ ok: false, kind: "conversation", at: new Date().toISOString(), category: data.category, message: data.error });
        if (response.status === 409) await onRefresh().catch(() => undefined);
        throw new Error(data.error ?? "The assistant could not complete this turn.");
      }
      recordAssistantResult({ ok: true, kind: "conversation", at: new Date().toISOString(), latencyMs: Math.round(performance.now() - started) });
      // A turn that saved nothing returns the snapshot from its start; reload instead so the view is never older than storage.
      if (data.changed) onWorkspace(data.workspace); else await onRefresh().catch(() => undefined);
      dictation.clearMessage();
      setMessages([...next, { role: "assistant", text: data.reply }]);
      setTrace(data.trace); setReport(data.report); setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The connection ended before a reply arrived. Refresh the workspace before retrying.");
    } finally { inFlight.current = false; onBusy(false); setSending(false); }
  }

  function toggleDictation() {
    if (dictating) { dictation.stop(); return; }
    setError("");
    dictation.start(text);
  }

  function speak() {
    const reply = messages.at(-1);
    if (reply?.role !== "assistant") return;
    if (!speakText(reply.text)) setError("Read aloud is unavailable in this browser.");
  }

  const configured = !!status?.configured;
  const micLabel = dictation.status === "stopping" ? "Finishing dictation" : dictating ? "Stop dictation" : "Start dictation";
  return <section className="assistant-card" aria-label={`Receiving assistant for ${order.reference}`}>
    <div className="assistant-heading"><span className="voice-symbol"><AudioLines size={21} /></span><div><h3>Talk through this delivery</h3><p>{order.reference} · Alexa+ experience simulator · Amazon Bedrock</p></div><span className={`pill ${shown.tone}`} title={shown.detail}>{shown.label}</span></div>
    {status && !configured ? <div className="assistant-setup"><Info size={18} /><div><strong>The conversational assistant needs its server settings.</strong><p>Manual receiving below is ready to use. Add the Amazon Bedrock settings to the server environment (for local use, <code>.env</code>) and restart the server. Keep the API key out of chat and browser code.</p><details><summary>Missing settings</summary><ul>{status.missing.map(key => <li key={key}><code>{key}</code>{key === "AWS_BEARER_TOKEN_BEDROCK" ? " (secret)" : ""}</li>)}</ul><a href="https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html" target="_blank" rel="noreferrer">Amazon Bedrock API keys ↗</a></details></div></div> : <>
      <div className="assistant-messages" role="log" aria-live="polite" aria-label="Receiving conversation">
        {!messages.length && <div className="assistant-welcome"><strong>Describe what arrived.</strong><p>I can check this order, ask about unclear quantities and prepare a receiving draft. You review and confirm the final receipt.</p></div>}
        {messages.map((message, index) => <div className={`assistant-message ${message.role}`} key={index}><small>{message.role === "user" ? "You" : "ReceiveRight"}</small><p>{message.text}</p></div>)}
        {sending && <div className="assistant-working" role="status"><LoaderCircle size={15} className="spin" />Checking the order and preparing a reply…</div>}<div ref={end} />
      </div>
      {!messages.length && <div className="assistant-suggestions">{["What is still outstanding?", "The rest of the delivery arrived.", "Help me record a damaged item."].map(value => <button key={value} disabled={busy || dictating || !configured} onClick={() => { setText(value); input.current?.focus(); }}>{value}</button>)}</div>}
      <form className="assistant-composer" onSubmit={e => { e.preventDefault(); void send(); }}>
        <label className="sr-only" htmlFor={`assistant-input-${order.id}`}>Message the receiving assistant</label>
        <textarea id={`assistant-input-${order.id}`} ref={input} rows={2} maxLength={3000} value={text} readOnly={dictating} aria-describedby={`assistant-dictation-${order.id}`} disabled={busy || !configured} placeholder={dictating ? "Listening… speak, then press stop to review the text." : "Describe this delivery or ask about the order…"} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }} />
        <div>
          <button className={`icon-button ${dictating ? "listening" : ""}`} type="button" disabled={busy || !configured || dictation.status === "stopping" || dictation.supported === false} onClick={toggleDictation} aria-label={micLabel} title={dictation.supported === false ? "Dictation is not available in this browser" : micLabel}>{dictating ? <Square size={15} /> : <Mic size={18} />}</button>
          <span id={`assistant-dictation-${order.id}`} aria-live="polite">{dictation.status === "listening" ? "Listening — press stop when you finish, then check the text." : dictation.status === "starting" ? "Starting the microphone…" : dictation.status === "stopping" ? "Finishing the last words…" : dictation.unavailable ? unavailableText[dictation.unavailable] : "Browser dictation fills this box. Check the text before sending."}</span>
          <button className={`button ${hasDraft ? "secondary" : "primary"} small`} disabled={busy || dictating || !configured || !text.trim() || messages.length >= 14} type="submit">{sending ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}Send</button>
        </div>
      </form>
      {dictation.message && <p className={`message ${dictation.message.kind === "error" ? "error" : "info"}`} role={dictation.message.kind === "error" ? "alert" : "status"}>{dictation.message.text}</p>}
      <div className="assistant-actions"><button className="button text-button small" disabled={busy || !messages.length} onClick={() => { dictation.abort(); setMessages([]); setTrace([]); setReport(null); setError(""); setText(""); }}><RefreshCw size={14} />New conversation</button><button className="button text-button small" disabled={busy || !messages.length} onClick={speak}><Volume2 size={15} />Read reply aloud</button><button className="button text-button small" disabled={busy || assistant.testing} onClick={() => void testAssistantConnection()}>{assistant.testing ? <LoaderCircle size={14} className="spin" /> : <PlugZap size={14} />}Test connection</button>{hasDraft && <button className="button secondary small" disabled={busy || dictating} onClick={onReview}><ClipboardCheck size={15} />Review draft</button>}{report && <button className="button secondary small" disabled={busy} onClick={() => onReport(report)}><FileText size={15} />Open supplier draft</button>}</div>
      {assistant.last && <p className={`assistant-status-line ${assistant.last.ok ? "" : "amber-text"}`} role="status">{shown.detail}</p>}
      {messages.length >= 14 && <p className="assistant-limit">Start a new conversation to continue. Your receiving records are saved separately.</p>}
      {trace.length > 0 && <details className="assistant-trace"><summary>Actions taken in this turn ({trace.length})</summary><ol>{trace.map((action, index) => <li key={index}><strong>{labels[action.name] ?? "Receiving action"}</strong><span className={action.status === "error" ? "amber-text" : ""}>{action.detail}</span></li>)}</ol></details>}
      <p className="assistant-disclosure">Dictation uses your browser&apos;s speech service and only fills the text box. When you send, the message and this order&apos;s data go to Amazon Bedrock, which may prepare a draft through validated receiving actions. Photo contents are not analyzed. Confirmation is always yours.</p>
    </>}
    {(error || assistant.loadError) && <p className="message error" role="alert">{error || assistant.loadError}</p>}
  </section>;
}
