"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hands-free voice conversation using the browser's built-in Web Speech API.
 *
 * Loop:  listen -> (you stop talking) -> onUtterance(text) -> speak the reply -> listen again
 * The loop runs until stop() is called, the mic is blocked, or nothing is heard several times in a row.
 *
 * Works in Chrome, Edge and Safari (desktop + phone). Needs HTTPS or localhost.
 * Firefox does not implement speech recognition.
 */

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

/* Minimal typings: the Web Speech API is not in TypeScript's default DOM lib. */
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Turn the coach's text into something that sounds natural when read aloud. */
export function toSpeakable(text: string): string {
  return text
    .replace(/[*_`#>~]+/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\bkcal\b/gi, "calories")
    .replace(/(\d)\s?g\b/g, "$1 grams")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Chrome silently cuts off long utterances, so read in sentence-sized pieces. */
function chunkForSpeech(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > 180 && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

const MAX_SILENT_ROUNDS = 3;

type Options = {
  /** Called with each thing the user said. Return the coach's reply to have it spoken, "" to say nothing, or null on failure (stops voice mode). */
  onUtterance: (text: string) => Promise<string | null>;
  /** Recognition language. en-IN suits Indian English; falls back gracefully. */
  lang?: string;
};

export function useVoiceChat({ onUtterance, lang = "en-IN" }: Options) {
  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [speakReplies, setSpeakRepliesState] = useState(true);

  const activeRef = useRef(false);
  const recRef = useRef<Recognition | null>(null);
  const speakRepliesRef = useRef(true);
  const onUtteranceRef = useRef(onUtterance);
  const silentRoundsRef = useRef(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speakTokenRef = useRef(0);
  const listenRef = useRef<() => void>(() => {});

  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current =
        voices.find(v => v.lang === lang) ||
        voices.find(v => v.lang.replace("_", "-").toLowerCase().startsWith("en-in")) ||
        voices.find(v => v.lang.toLowerCase().startsWith("en")) ||
        null;
    };
    pickVoice();
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pickVoice);
  }, [lang]);

  const halt = useCallback((message = "") => {
    activeRef.current = false;
    speakTokenRef.current += 1;
    try { recRef.current?.abort(); } catch { /* already stopped */ }
    recRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setActive(false);
    setPhase("idle");
    setInterim("");
    setError(message);
  }, []);

  /** Speak text aloud; resolves when finished (or cancelled). */
  const speak = useCallback((text: string) => new Promise<void>(resolve => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { resolve(); return; }
    const chunks = chunkForSpeech(toSpeakable(text));
    if (chunks.length === 0) { resolve(); return; }
    const token = ++speakTokenRef.current;
    window.speechSynthesis.cancel();
    let index = 0;
    const next = () => {
      if (token !== speakTokenRef.current || index >= chunks.length) { resolve(); return; }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      utterance.lang = voiceRef.current?.lang || lang;
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.rate = 1.02;
      utterance.onend = next;
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    };
    next();
  }), [lang]);

  const handleUtterance = useCallback(async (text: string) => {
    setPhase("thinking");
    setInterim("");
    let reply: string | null;
    try {
      reply = await onUtteranceRef.current(text);
    } catch {
      reply = null;
    }
    if (!activeRef.current) return; // user pressed stop while the coach was thinking
    if (reply === null) { halt("The coach didn't respond, so voice mode was paused."); return; }
    if (reply && speakRepliesRef.current) {
      setPhase("speaking");
      await speak(reply);
      if (!activeRef.current) return;
    }
    listenRef.current();
  }, [halt, speak]);

  const listen = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || !activeRef.current) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalText = "";
    let fatal = false;

    rec.onresult = event => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim((finalText + interimText).trim());
    };

    rec.onerror = event => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        fatal = true;
        halt("Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.");
      } else if (event.error === "audio-capture") {
        fatal = true;
        halt("No microphone was found. Connect one and try again.");
      } else if (event.error === "network") {
        fatal = true;
        halt("Speech recognition needs an internet connection. Check your connection and try again.");
      }
      // "no-speech" and "aborted" are normal; onend decides what happens next.
    };

    rec.onend = () => {
      if (fatal || !activeRef.current || recRef.current !== rec) return;
      const text = finalText.trim();
      if (text) {
        silentRoundsRef.current = 0;
        void handleUtterance(text);
        return;
      }
      silentRoundsRef.current += 1;
      if (silentRoundsRef.current >= MAX_SILENT_ROUNDS) {
        halt("I didn't hear anything, so the microphone was turned off. Tap the mic to start again.");
        return;
      }
      listenRef.current();
    };

    recRef.current = rec;
    setPhase("listening");
    setInterim("");
    try {
      rec.start();
    } catch {
      halt("Couldn't start the microphone. Try again.");
    }
  }, [halt, handleUtterance, lang]);

  useEffect(() => { listenRef.current = listen; }, [listen]);

  const start = useCallback(() => {
    if (!getRecognitionCtor()) {
      setError("Voice input isn't supported in this browser. Use Chrome, Edge or Safari.");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("The microphone only works on https:// or localhost.");
      return;
    }
    // Phones only allow speech playback after a tap, so unlock it inside this click.
    if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    setError("");
    silentRoundsRef.current = 0;
    activeRef.current = true;
    setActive(true);
    listen();
  }, [listen]);

  const stop = useCallback(() => halt(""), [halt]);

  const setSpeakReplies = useCallback((value: boolean) => {
    speakRepliesRef.current = value;
    setSpeakRepliesState(value);
    if (!value && typeof window !== "undefined" && "speechSynthesis" in window) {
      speakTokenRef.current += 1;
      window.speechSynthesis.cancel();
    }
  }, []);

  /** Tap while the coach is talking to cut in and start listening straight away. */
  const interrupt = useCallback(() => {
    if (!activeRef.current) return;
    // Cutting the speech resolves speak(), and the loop then starts listening on its own.
    speakTokenRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => () => {
    activeRef.current = false;
    try { recRef.current?.abort(); } catch { /* ignore */ }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  return { supported, active, phase, interim, error, speakReplies, setSpeakReplies, start, stop, interrupt, clearError: () => setError("") };
}