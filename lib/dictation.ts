// Browser dictation shared by both voice entry points (assistant composer and guided count input).
// This only turns speech into editable text. It never submits anything: the person reviews the text
// and presses Send/Apply. Parsing counts and Bedrock reasoning happen later, on the server.

export type DictationStatus = "idle" | "starting" | "listening" | "stopping";
export type DictationMessage = { kind: "info" | "error"; text: string };
type Alternative = { transcript: string };
export type RecognitionResultLike = { readonly isFinal: boolean; readonly length: number; readonly [index: number]: Alternative };
export type RecognitionEventLike = { readonly resultIndex: number; readonly results: { readonly length: number; readonly [index: number]: RecognitionResultLike } };
export type RecognizerLike = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives?: number;
  onstart: (() => void) | null; onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

/** Join transcript pieces with single spaces. Browser segments often carry their own leading space. */
export function joinTranscript(...parts: string[]): string {
  return parts.map(p => p.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
}

/**
 * Text heard in the current recognition session. The results list holds every result of the session:
 * final results stay in place and the trailing interim results are replaced as the browser revises its
 * hypothesis. Rebuilding from the whole list therefore never duplicates revised interim text.
 */
export function sessionTranscript(event: RecognitionEventLike): { final: string; interim: string } {
  const finals: string[] = []; const interim: string[] = [];
  for (let i = 0; i < event.results.length; i++) {
    const result = event.results[i];
    const text = result?.[0]?.transcript ?? "";
    (result?.isFinal ? finals : interim).push(text);
  }
  return { final: joinTranscript(...finals), interim: joinTranscript(...interim) };
}

const errorText: Record<string, DictationMessage> = {
  "not-allowed": { kind: "error", text: "Microphone access is blocked. Allow the microphone for this site in your browser settings, or type instead." },
  "service-not-allowed": { kind: "error", text: "This browser does not allow its speech service here. Type instead, or try Chrome or Edge on this computer." },
  "audio-capture": { kind: "error", text: "The microphone is unavailable or in use by another tab or app. Check it and tap the microphone to try again, or type instead." },
  "network": { kind: "error", text: "The browser's speech service could not be reached. Your text so far is kept; resume dictation or type." },
  "no-speech": { kind: "info", text: "No speech was heard. Tap the microphone to try again, or type." },
  "language-not-supported": { kind: "error", text: "English dictation is not available in this browser. Type instead." },
};

const fatalErrors = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);

export type DictationOptions = {
  /** Returns a new recognizer, or null when the browser has none. */
  create: () => RecognizerLike | null;
  onText: (text: string) => void;
  onStatus: (status: DictationStatus) => void;
  onMessage: (message: DictationMessage | null) => void;
  /** Stops the app's own speech so the microphone does not record it. */
  cancelSpeech?: () => void;
  lang?: string;
  /** Finalize if a browser never reports the end of a stopped session. */
  stopTimeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};
export type Dictation = { readonly status: DictationStatus; start(startText: string): boolean; stop(): void; abort(): void };

// Only one recognizer runs at a time across the page.
let active: Dictation | null = null;

export function createDictation(options: DictationOptions): Dictation {
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let status: DictationStatus = "idle";
  let recognizer: RecognizerLike | null = null;
  let generation = 0;
  let base = "";
  let heard = { final: "", interim: "" };
  let stoppedByUser = false;
  let failed = false;
  let stopTimer: unknown = null;

  const setStatus = (next: DictationStatus) => { status = next; options.onStatus(next); };
  const text = () => joinTranscript(base, heard.final, heard.interim);
  function detach(r: RecognizerLike | null) { if (r) { r.onstart = r.onresult = r.onerror = r.onend = null; } }
  function finish(gen: number) {
    if (gen !== generation || status === "idle") return;
    if (stopTimer !== null) { clearTimer(stopTimer); stopTimer = null; }
    // Keep everything heard, including an interim tail the browser never finalized.
    base = text(); heard = { final: "", interim: "" };
    detach(recognizer); recognizer = null;
    if (active === self) active = null;
    options.onText(base);
    if (!stoppedByUser && !failed) options.onMessage({ kind: "info", text: "Dictation stopped. Your text is kept. Tap the microphone to continue, or edit and send." });
    setStatus("idle");
  }

  const self: Dictation = {
    get status() { return status; },
    /** Begin a session that appends to `startText` (the current, possibly edited, text). */
    start(startText: string): boolean {
      if (status !== "idle") return false;
      if (active && active !== self) active.stop();
      options.cancelSpeech?.();
      const r = options.create();
      if (!r) { options.onMessage({ kind: "error", text: "Voice input is unavailable in this browser. Type instead; Chrome and Edge on desktop support dictation." }); return false; }
      const gen = ++generation;
      base = joinTranscript(startText); heard = { final: "", interim: "" }; stoppedByUser = false; failed = false;
      r.lang = options.lang ?? "en-US"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
      r.onstart = () => { if (gen === generation && status === "starting") setStatus("listening"); };
      r.onresult = event => {
        if (gen !== generation) return;
        if (status === "starting") setStatus("listening");
        heard = sessionTranscript(event); options.onText(text());
      };
      r.onerror = event => {
        if (gen !== generation || event.error === "aborted") return;
        failed = true;
        options.onMessage(errorText[event.error] ?? { kind: "error", text: "Dictation stopped unexpectedly. Your text is kept; try again or type." });
        // Permission and device errors end the session; Safari may not fire "end" after them.
        if (fatalErrors.has(event.error)) finish(gen);
        else if (stopTimer === null) stopTimer = setTimer(() => { stopTimer = null; if (gen === generation) { try { r.abort(); } catch { /* ignore */ } finish(gen); } }, options.stopTimeoutMs ?? 2500);
      };
      r.onend = () => finish(gen);
      recognizer = r; active = self;
      options.onMessage(null);
      setStatus("starting");
      try { r.start(); }
      catch {
        detach(r); recognizer = null; if (active === self) active = null; generation++;
        options.onMessage({ kind: "error", text: "The microphone could not start. Type instead, or reload the page and try again." });
        setStatus("idle");
        return false;
      }
      return true;
    },
    /** Graceful stop: results the browser finalizes after stop() are still kept. */
    stop() {
      if (status !== "starting" && status !== "listening") return;
      stoppedByUser = true;
      setStatus("stopping");
      const gen = generation;
      const r = recognizer;
      try { r?.stop(); } catch { /* already stopped */ }
      if (stopTimer !== null) clearTimer(stopTimer);
      // Chrome ignores abort() after stop(), so the session is finalized locally and its late events are dropped by generation.
      stopTimer = setTimer(() => { stopTimer = null; if (gen !== generation) return; try { r?.abort(); } catch { /* ignore */ } finish(gen); }, options.stopTimeoutMs ?? 2500);
    },
    /** Discard the session without emitting text (unmount, order change). */
    abort() {
      if (stopTimer !== null) { clearTimer(stopTimer); stopTimer = null; }
      generation++;
      const r = recognizer; recognizer = null; detach(r);
      try { r?.abort(); } catch { /* ignore */ }
      if (active === self) active = null;
      options.onMessage(null);
      if (status !== "idle") setStatus("idle");
    },
  };
  return self;
}

/** The browser's recognizer, or null when unsupported or not in a secure context. */
export function browserRecognizer(): RecognizerLike | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const w = window as typeof window & { SpeechRecognition?: new () => RecognizerLike; webkitSpeechRecognition?: new () => RecognizerLike };
  const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Constructor ? new Constructor() : null;
}
/** Why dictation cannot run here, or null when it can. */
export function dictationUnavailableReason(): "insecure" | "unsupported" | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) return "insecure";
  const w = window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ? null : "unsupported";
}
export const unavailableText = { insecure: "Dictation needs https or localhost. Type instead.", unsupported: "Dictation is unavailable in this browser. Type instead; Chrome and Edge on desktop support it." };
/** Gracefully stop whichever dictation is running (before a dialog opens or the page changes). */
export function stopActiveDictation() { active?.stop(); }
export function dictationSupported() {
  if (typeof window === "undefined" || !window.isSecureContext) return false;
  const w = window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

/** Read text aloud after stopping any dictation, so the microphone does not capture the app's own voice. */
export function speakText(text: string, onEnd?: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  active?.stop();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (onEnd) { utterance.onend = onEnd; utterance.onerror = onEnd; }
  window.speechSynthesis.speak(utterance);
  return true;
}
export function cancelSpeech() { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); }
