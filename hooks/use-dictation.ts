"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { browserRecognizer, cancelSpeech, createDictation, dictationUnavailableReason, type Dictation, type DictationMessage, type DictationStatus } from "../lib/dictation";

/** React binding for lib/dictation.ts. The recognizer is aborted on unmount; text is only ever placed in the input. */
export function useDictation(onText: (text: string) => void) {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [message, setMessage] = useState<DictationMessage | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [unavailable, setUnavailable] = useState<"insecure" | "unsupported" | null>(null);
  const textHandler = useRef(onText);
  const controller = useRef<Dictation | null>(null);
  useEffect(() => { textHandler.current = onText; }, [onText]);
  useEffect(() => {
    const dictation = createDictation({ create: browserRecognizer, onText: text => textHandler.current(text), onStatus: setStatus, onMessage: setMessage, cancelSpeech });
    controller.current = dictation;
    // Feature detection needs the browser, so it runs after mount to keep server and client markup identical.
    const reason = dictationUnavailableReason();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(reason === null); setUnavailable(reason);
    return () => { dictation.abort(); controller.current = null; };
  }, []);
  // Stable callbacks, so callers can use them in effects and event handlers without re-subscribing.
  const actions = useMemo(() => ({
    start: (currentText: string) => controller.current?.start(currentText) ?? false,
    stop: () => controller.current?.stop(),
    abort: () => controller.current?.abort(),
    clearMessage: () => setMessage(null),
  }), []);
  return { status, message, supported, unavailable, active: status !== "idle", ...actions };
}
