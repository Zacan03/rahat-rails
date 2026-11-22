"use client";

import { useEffect, useRef, useState } from "react";

/** Uses local speech when available, with server TTS fallback; text/buttons remain available. */
type Rec = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null; start(): void; stop(): void;
};

export function Speak({
  text,
  urText,
  language,
  compact = false,
  ariaLabel,
  buttonLabel,
}: {
  text: string;
  urText?: string;
  language?: "ur" | "en";
  compact?: boolean;
  ariaLabel?: string;
  buttonLabel?: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackId = useRef(0);

  useEffect(() => () => {
    playbackId.current += 1;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  function play(lang: "ur-PK" | "en-US") {
    const speechText = lang === "ur-PK" && urText ? urText : text;
    const requestId = ++playbackId.current;
    let remoteStarted = false;

    const playServerTts = () => {
      if (remoteStarted || requestId !== playbackId.current) return;
      remoteStarted = true;
      window.speechSynthesis?.cancel();
      const params = new URLSearchParams({
        lang: lang === "ur-PK" ? "ur" : "en",
        text: speechText,
      });
      const audio = new Audio(`/api/tts?${params.toString()}`);
      audioRef.current = audio;
      audio.onended = () => {
        if (audioRef.current === audio) audioRef.current = null;
      };
      audio.onerror = () => {
        if (requestId === playbackId.current) {
          setMsg("Voice playback failed. Please read the text or ask a helper.");
        }
        if (audioRef.current === audio) audioRef.current = null;
      };
      void audio.play().catch(() => {
        if (requestId === playbackId.current) {
          setMsg("Voice playback failed. Please read the text or ask a helper.");
        }
      });
    };

    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window === "undefined") {
      setMsg("Voice is not available on this device. Please read the text or ask a helper.");
      return;
    }
    if (!("speechSynthesis" in window)) {
      playServerTts();
      return;
    }

    setMsg(null);
    try {
      const voices = window.speechSynthesis.getVoices();
      const hasVoice = voices.some((voice) => voice.lang.toLowerCase().startsWith(lang.slice(0, 2)));
      if (!hasVoice) {
        playServerTts();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.lang = lang;
      utterance.onerror = playServerTts;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      playServerTts();
    }
  }
  if (language) {
    const isUrdu = language === "ur";
    return (
      <span className="inline-flex items-center gap-2 align-middle">
        <button
          type="button"
          onClick={() => play(isUrdu ? "ur-PK" : "en-US")}
          className={compact
            ? "min-h-12 min-w-12 rounded-lg border border-slate-300 bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
            : "min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"}
          aria-label={ariaLabel ?? `Listen in ${isUrdu ? "Urdu" : "English"}`}
          title={ariaLabel ?? `Listen in ${isUrdu ? "Urdu" : "English"}`}
        >
          🔊{buttonLabel ? ` ${buttonLabel}` : ""}
        </button>
        {msg && <span role="status" className="text-xs text-amber-800">{msg}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 align-middle">
      <button type="button" onClick={() => play("ur-PK")} className="min-h-11 min-w-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold" aria-label="Listen in Urdu">🔊 اردو</button>
      <button type="button" onClick={() => play("en-US")} className="min-h-11 min-w-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold" aria-label="Listen in English">🔊 EN</button>
      {msg && <span role="status" className="text-xs text-amber-800">{msg}</span>}
    </span>
  );
}

/** Speech-to-text with explicit tap and transcript CONFIRMATION before anything is used. */
export function Dictate({ onConfirm, label }: { onConfirm: (text: string) => void; label: string }) {
  const [state, setState] = useState<"idle" | "listening" | "confirm" | "unsupported" | "error">("idle");
  const [heard, setHeard] = useState("");

  function start() {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setState("unsupported"); return; }
    const r = new Ctor();
    r.lang = "ur-PK";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => { setHeard(e.results[0][0].transcript.slice(0, 120)); setState("confirm"); };
    r.onerror = () => setState("error");
    r.onend = () => setState((s) => (s === "listening" ? "idle" : s));
    setState("listening");
    r.start();
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={start} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold" aria-label={label}>🎤 {label}</button>
      {state === "listening" && <span role="status" className="ml-3 text-sm">Listening… / سن رہا ہوں…</span>}
      {state === "unsupported" && <p role="status" className="mt-2 text-sm text-amber-800">Speech input is not supported in this browser. Please type, or ask a helper.</p>}
      {state === "error" && <p role="status" className="mt-2 text-sm text-amber-800">Could not hear you (or microphone blocked). Please type instead.</p>}
      {state === "confirm" && (
        <div className="mt-2 rounded-xl border border-slate-300 bg-slate-50 p-3">
          <p className="text-sm">We heard (synthetic demo speech only):</p>
          <p className="my-1 text-lg font-semibold" dir="auto">{heard}</p>
          <button type="button" className="mr-2 min-h-11 rounded-xl bg-teal-800 px-4 font-semibold text-white" onClick={() => { onConfirm(heard); setState("idle"); }}>✓ Use this</button>
          <button type="button" className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 font-semibold" onClick={() => setState("idle")}>✗ Discard</button>
        </div>
      )}
    </div>
  );
}
