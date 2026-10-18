import test from "node:test";
import assert from "node:assert/strict";
import { createDictation, joinTranscript, sessionTranscript } from "../lib/dictation.ts";

// A scripted stand-in for the browser recognizer. Events are fired the way Chrome fires them:
// the results list holds every result of the session, and only the trailing interim results change.
function fakeBrowser() {
  const made = [];
  const create = () => {
    const r = { lang: "", continuous: false, interimResults: false, onstart: null, onresult: null, onerror: null, onend: null, started: 0, stopped: 0, aborted: 0,
      results: [],
      start() { this.started++; queueMicrotask(() => this.onstart?.()); },
      stop() { this.stopped++; }, abort() { this.aborted++; },
      hear(text, isFinal) { // replace the trailing interim result or append a new one
        const last = this.results.at(-1);
        const entry = Object.assign([{ transcript: text }], { isFinal });
        if (last && !last.isFinal) this.results[this.results.length - 1] = entry; else this.results.push(entry);
        const resultIndex = this.results.findIndex(x => !x.isFinal) === -1 ? this.results.length - 1 : this.results.findIndex(x => !x.isFinal);
        this.onresult?.({ resultIndex, results: this.results });
      },
      end() { this.onend?.(); }, fail(error) { this.onerror?.({ error }); this.onend?.(); },
    };
    made.push(r); return r;
  };
  return { made, create };
}
function harness(extra = {}) {
  const browser = fakeBrowser(); const log = { text: [], status: [], messages: [] }; let speechCancelled = 0;
  const timers = [];
  const d = createDictation({ create: browser.create, onText: t => log.text.push(t), onStatus: s => log.status.push(s), onMessage: m => log.messages.push(m), cancelSpeech: () => speechCancelled++,
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, ...extra });
  return { d, browser, log, timers, get speechCancelled() { return speechCancelled; }, get text() { return log.text.at(-1) ?? ""; } };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const FULL = "Ten cases of oat milk arrived in total, including one damaged. Prepare the receipt for review.";

test("transcript helpers join segments and never duplicate revised interim text", () => {
  assert.equal(joinTranscript(" Ten cases ", "", "  of oat milk"), "Ten cases of oat milk");
  const results = [Object.assign([{ transcript: "Ten cases of oat milk arrived in total," }], { isFinal: true }), Object.assign([{ transcript: " including one" }], { isFinal: false })];
  assert.deepEqual(sessionTranscript({ resultIndex: 1, results }), { final: "Ten cases of oat milk arrived in total,", interim: "including one" });
});

test("the full utterance across several segments, revisions and a pause is preserved exactly once", async () => {
  const h = harness();
  assert.equal(h.d.start(""), true); await tick();
  const r = h.browser.made[0];
  assert.equal(r.continuous, true); assert.equal(r.interimResults, true); assert.equal(h.d.status, "listening");
  r.hear("Ten cases", false); r.hear("Ten cases of oat", false); r.hear("Ten cases of oat milk arrived in total,", true);
  r.hear(" including one", false); r.hear(" including one damaged.", false); r.hear(" including one damaged.", true);
  assert.equal(h.text, "Ten cases of oat milk arrived in total, including one damaged.");
  // A pause before the final sentence: Chrome keeps the session open in continuous mode.
  r.hear(" Prepare the", false); r.hear(" Prepare the receipt for review.", true);
  assert.equal(h.text, FULL);
  h.d.stop(); assert.equal(h.d.status, "stopping"); r.end();
  assert.equal(h.text, FULL); assert.equal(h.d.status, "idle");
  assert.ok(!h.log.messages.some(m => m?.kind === "info"), "a user stop is not reported as an unexpected end");
});

test("a session the browser ends after 'including one damaged' keeps the text and resumes on request only", async () => {
  const h = harness();
  h.d.start(""); await tick(); const first = h.browser.made[0];
  first.hear("Ten cases of oat milk arrived in total, including one damaged.", true); first.end();
  assert.equal(h.text, "Ten cases of oat milk arrived in total, including one damaged.");
  assert.equal(h.browser.made.length, 1, "no automatic restart");
  assert.equal(h.log.messages.at(-1).kind, "info");
  // The person resumes explicitly; the new session appends to the kept text.
  h.d.start(h.text); await tick(); const second = h.browser.made[1];
  second.hear("Prepare the receipt", false); second.hear("Prepare the receipt for review.", true);
  assert.equal(h.text, FULL);
});

test("a correction typed before resuming becomes the new base text", async () => {
  const h = harness();
  h.d.start(""); await tick(); h.browser.made[0].hear("Ten cases arrived including one damaged", true); h.d.stop(); h.browser.made[0].end();
  const edited = "Nine cases arrived, including one damaged.";
  h.d.start(edited); await tick(); h.browser.made[1].hear("Prepare the receipt for review.", true); h.d.stop(); h.browser.made[1].end();
  assert.equal(h.text, "Nine cases arrived, including one damaged. Prepare the receipt for review.");
});

test("a final result delivered after stop() is kept; nothing arrives after abort()", async () => {
  const h = harness();
  h.d.start(""); await tick(); const r = h.browser.made[0];
  r.hear("Ten cases of oat milk", false); h.d.stop();
  r.hear("Ten cases of oat milk arrived", true); r.end();
  assert.equal(h.text, "Ten cases of oat milk arrived");
  h.d.start(""); await tick(); const r2 = h.browser.made[1];
  r2.hear("stale words", false); const count = h.log.text.length; h.d.abort();
  r2.hear("stale words after abort", true); r2.end();
  assert.equal(h.log.text.length, count, "aborted session cannot change the text after the person moved on");
  assert.equal(r2.aborted, 1); assert.equal(h.d.status, "idle");
});

test("errors keep captured text and give guidance; unsupported browsers fall back to typing", async () => {
  const h = harness();
  h.d.start("Ten cases"); await tick(); const r = h.browser.made[0];
  r.hear("arrived including one", false); r.fail("network");
  assert.equal(h.text, "Ten cases arrived including one");
  assert.match(h.log.messages.at(-1).text, /speech service could not be reached/);
  assert.equal(h.browser.made.length, 1);
  for (const [error, pattern] of [["not-allowed", /Microphone access is blocked/], ["no-speech", /No speech/], ["audio-capture", /microphone is unavailable/]]) {
    const x = harness(); x.d.start(""); await tick(); x.browser.made[0].fail(error); assert.match(x.log.messages.at(-1).text, pattern); assert.equal(x.d.status, "idle");
  }
  const none = createDictation({ create: () => null, onText() {}, onStatus() {}, onMessage: m => { none.message = m; } });
  assert.equal(none.start(""), false); assert.match(none.message.text, /unavailable in this browser/);
});

test("only one recognizer runs, duplicate starts are ignored, speech playback is cancelled, and a hung stop finalizes", async () => {
  const a = harness(); const b = harness();
  a.d.start(""); await tick(); assert.equal(a.d.start(""), false, "second start while listening is ignored");
  assert.equal(a.speechCancelled, 1);
  a.browser.made[0].hear("from the assistant box", true);
  b.d.start(""); await tick();
  assert.equal(a.browser.made[0].stopped, 1, "starting another entry point stops the first");
  a.browser.made[0].end(); assert.equal(a.d.status, "idle"); assert.equal(a.text, "from the assistant box");
  // A browser that never fires 'end' after stop() is finalized by the timer, keeping the text.
  b.browser.made[0].hear("ten cases", false); b.d.stop(); b.timers[0]();
  assert.equal(b.d.status, "idle"); assert.equal(b.text, "ten cases"); assert.equal(b.browser.made[0].aborted, 1);
});

test("a permission error ends the session immediately even if the browser never fires end (Safari)", async () => {
  const h = harness();
  h.d.start("Ten cases"); await tick();
  h.browser.made[0].onerror({ error: "not-allowed" });
  assert.equal(h.d.status, "idle"); assert.equal(h.text, "Ten cases"); assert.match(h.log.messages.at(-1).text, /blocked/);
  // A network error without an end event is finalized by the timer instead of hanging in "listening".
  const n = harness(); n.d.start(""); await tick(); n.browser.made[0].hear("ten cases", false); n.browser.made[0].onerror({ error: "network" });
  assert.equal(n.d.status, "listening"); n.timers[0](); assert.equal(n.d.status, "idle"); assert.equal(n.text, "ten cases");
  assert.equal(n.browser.made.length, 1, "no automatic restart after an error");
});

test("an error timer followed by stop and a quick retry cannot abort the new session", async () => {
  const h = harness();
  h.d.start(""); await tick(); const first = h.browser.made[0];
  first.hear("ten cases", false); first.onerror({ error: "network" });   // error timer armed, no end yet
  h.d.stop();                                                            // stop replaces the timer
  h.timers.at(-1)();                                                      // stop timer finalizes the first session
  assert.equal(h.d.status, "idle");
  h.d.start(h.text); await tick(); const second = h.browser.made[1];
  for (const fire of h.timers) fire();                                    // any stale timer fires late
  assert.equal(second.aborted, 0, "the retry keeps running");
  assert.equal(h.d.status, "listening");
  second.hear("arrived", true); assert.equal(h.text, "ten cases arrived");
});
