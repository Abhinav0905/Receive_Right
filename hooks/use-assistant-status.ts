"use client";
import { useSyncExternalStore } from "react";

// One shared, truthful Bedrock status for the whole page: configuration comes from the server,
// and "last result" exists only after an actual request in this browser session.
export type ProviderStatus = { provider: string; configured: boolean; missing: string[]; region: string | null; model: string | null };
export type LastResult = { ok: boolean; at: string; kind: "connection test" | "conversation"; latencyMs?: number; category?: string; message?: string };
type Snapshot = { status: ProviderStatus | null; loadError: string | null; signInRequired: boolean; last: LastResult | null; testing: boolean };

let snapshot: Snapshot = { status: null, loadError: null, signInRequired: false, last: null, testing: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<Snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(l => l()); };
let loading: Promise<void> | null = null;
const serverSnapshot: Snapshot = { status: null, loadError: null, signInRequired: false, last: null, testing: false };

export function loadAssistantStatus(force = false) {
  if (loading && !force) return loading;
  loading = fetch("/api/assistant", { credentials: "same-origin", headers: { Accept: "application/json" } }).then(async response => {
    if (response.status === 401 || response.redirected) { set({ signInRequired: true }); return; }
    if (!response.ok) throw new Error("Could not check the assistant configuration. Refresh to try again.");
    set({ status: await response.json() as ProviderStatus, loadError: null });
  }).catch(cause => { set({ loadError: cause instanceof Error ? cause.message : "Could not check the assistant configuration." }); loading = null; });
  return loading;
}

/** Record the outcome of a real request (a conversation turn). Conflicts and local validation errors are not provider results. */
export function recordAssistantResult(result: LastResult) { set({ last: result }); }

/** Explicit live connection test. It changes no receiving data and is never retried automatically. */
export async function testAssistantConnection() {
  if (snapshot.testing) return;
  set({ testing: true });
  const started = performance.now();
  try {
    const response = await fetch("/api/assistant/test", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } });
    if (response.status === 401 || response.redirected) { set({ signInRequired: true }); return; }
    const data = await response.json() as { ok?: boolean; testedAt?: string; latencyMs?: number; category?: string; error?: string };
    set({ last: { ok: !!data.ok, kind: "connection test", at: data.testedAt ?? new Date().toISOString(), latencyMs: data.latencyMs ?? Math.round(performance.now() - started), category: data.category, message: data.ok ? undefined : data.error ?? "The connection test failed." } });
  } catch {
    set({ last: { ok: false, kind: "connection test", at: new Date().toISOString(), category: "unreachable", message: "The connection test could not reach this app's server." } });
  } finally { set({ testing: false }); }
}

export function useAssistantStatus() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => snapshot, () => serverSnapshot);
}

export function describeStatus(s: Snapshot): { label: string; tone: "green" | "amber" | "neutral"; detail: string } {
  if (s.loadError) return { label: "Status unavailable", tone: "amber", detail: s.loadError };
  if (!s.status) return { label: "Checking setup", tone: "neutral", detail: "Checking the server configuration…" };
  if (!s.status.configured) return { label: "Setup needed", tone: "amber", detail: `Missing server settings: ${s.status.missing.join(", ")}. Manual receiving still works.` };
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  if (!s.last) return { label: "Configured · not tested", tone: "neutral", detail: "Settings are present. No request has been made from this page yet, so access is not verified." };
  if (s.last.ok) return { label: `Bedrock responded · ${time(s.last.at)}`, tone: "green", detail: `The last ${s.last.kind} succeeded at ${time(s.last.at)}${s.last.latencyMs ? ` in ${(s.last.latencyMs / 1000).toFixed(1)} s` : ""}. A past success does not guarantee the key is still valid.` };
  return { label: "Last request failed", tone: "amber", detail: `${s.last.kind === "connection test" ? "Connection test" : "Conversation"} failed at ${time(s.last.at)}: ${s.last.message ?? "unknown error"}` };
}
