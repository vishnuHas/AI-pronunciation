"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { WordResult, ErrorType } from "@/lib/types";

interface WordTooltipProps {
  word: WordResult;
  children: React.ReactNode;
  audioUrl?: string | null;
}

// ── Error type metadata ───────────────────────────────────────────────────────
const ERROR_META: Record<ErrorType, { label: string; color: string; bg: string; border: string; desc: string }> = {
  vowel:     { label: "Vowel Error",     color: "text-rose-700",   bg: "bg-rose-50",   border: "border-rose-200", desc: "Wrong vowel sound" },
  consonant: { label: "Consonant Error", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", desc: "Wrong consonant" },
  stress:    { label: "Stress Error",    color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200", desc: "Wrong syllable stress" },
  omission:  { label: "Omission",        color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", desc: "Dropped sound/syllable" },
  insertion: { label: "Insertion",       color: "text-sky-700",    bg: "bg-sky-50",    border: "border-sky-200",   desc: "Extra sound added" },
  unclear:   { label: "Unclear",         color: "text-slate-600",  bg: "bg-slate-50",  border: "border-slate-200", desc: "Broadly unclear articulation" },
};

// ── Component ─────────────────────────────────────────────────────────────────
export function WordTooltip({ word, children, audioUrl }: WordTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<"above" | "below">("above");
  
  // Audio playback states: "idle" | "loading" | "playing"
  const [userAudioState, setUserAudioState] = useState<"idle" | "loading" | "playing">("idle");
  const [aiAudioState, setAiAudioState] = useState<"idle" | "loading" | "playing">("idle");
  
  const stopRef = useRef<(() => void) | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const meta = word.errorType ? ERROR_META[word.errorType] : ERROR_META["unclear"];
  const confidencePct = Math.round(word.confidence * 100);

  useEffect(() => {
    if (isOpen && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPosition(rect.bottom + 340 > window.innerHeight ? "above" : "below");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      stopRef.current?.();
      window.speechSynthesis?.cancel();
      setUserAudioState("idle");
      setAiAudioState("idle");
    }
  }, [isOpen]);

  const handlePlayUser = useCallback(async () => {
    if (!audioUrl) return;
    if (userAudioState === "playing") {
      stopRef.current?.();
      setUserAudioState("idle");
      return;
    }
    
    // Stop any running AI audio
    window.speechSynthesis?.cancel();
    setAiAudioState("idle");

    setUserAudioState("loading");
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const duration = word.endTime - word.startTime;
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      source.onended = () => {
        setUserAudioState("idle");
        try { ctx.close(); } catch (_) {}
      };

      setUserAudioState("playing");
      source.start(0, word.startTime, Math.max(duration, 0.3));

      stopRef.current = () => {
        try { source.stop(); } catch (_) {}
        try { ctx.close(); } catch (_) {}
      };
    } catch (e) {
      console.error("[WordTooltip] user audio playback failed:", e);
      setUserAudioState("idle");
    }
  }, [audioUrl, word.startTime, word.endTime, userAudioState]);

  const handlePlayAI = useCallback(() => {
    if (aiAudioState === "playing") {
      window.speechSynthesis?.cancel();
      setAiAudioState("idle");
      return;
    }
    
    // Stop any running user audio
    stopRef.current?.();
    setUserAudioState("idle");

    setAiAudioState("loading");
    window.speechSynthesis?.cancel();

    const utt = new SpeechSynthesisUtterance(word.text);
    utteranceRef.current = utt;
    utt.lang = "en-US";
    utt.rate = 0.80;
    utt.pitch = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Neural"))
    ) || voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utt.voice = preferred;

    utt.onstart = () => {
      setAiAudioState("playing");
    };

    utt.onend = () => {
      setAiAudioState("idle");
    };

    utt.onerror = () => {
      setAiAudioState("idle");
    };

    window.speechSynthesis.speak(utt);

    // Fallback if browser's SpeechSynthesis events do not fire properly
    const timer = setTimeout(() => {
      if (aiAudioState === "loading") {
        setAiAudioState("playing");
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [word.text, aiAudioState]);

  // Animated Waveform when playing, loading spinner when loading, or simple play icon
  const AudioIcon = ({ state, color }: { state: "idle" | "loading" | "playing"; color: string }) => {
    if (state === "loading") {
      return (
        <svg className="animate-spin h-4.5 w-4.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
    }
    
    if (state === "playing") {
      return (
        <span className="flex items-end gap-[2px] h-3.5 w-5">
          {[60, 100, 75, 55].map((h, i) => (
            <span
              key={i}
              className={`w-[3px] ${color} rounded-full animate-bounce`}
              style={{ height: `${h}%`, animationDelay: `${i * 0.1}s`, animationDuration: "0.55s" }}
            />
          ))}
        </span>
      );
    }

    return (
      <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    );
  };

  return (
    <span ref={ref} className="relative inline-block">
      <span
        onClick={() => setIsOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setIsOpen((v) => !v)}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
        aria-label={`${word.text} — ${meta.label}`}
      >
        {children}
      </span>

      {isOpen && (
        <div
          ref={tooltipRef}
          className={`
            absolute z-50 w-[340px] rounded-2xl overflow-hidden
            shadow-2xl shadow-slate-400/20 border border-slate-100
            tooltip-content bg-white
            ${position === "above"
              ? "bottom-full mb-3 left-1/2 -translate-x-1/2"
              : "top-full mt-3 left-1/2 -translate-x-1/2"}
          `}
        >
          {/* Caret */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white border rotate-45 z-10
              ${position === "above" ? "bottom-[-7px] border-t-0 border-l-0 border-slate-100"
                : "top-[-7px] border-b-0 border-r-0 border-slate-100"}`}
          />

          {/* ── Header band ── */}
          <div className={`px-4 pt-3.5 pb-2.5 flex items-center justify-between border-b ${meta.bg} ${meta.border}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-800 font-bold text-sm">&ldquo;{word.text}&rdquo;</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.border} ${meta.color}`}>
                {meta.label}
              </span>
              <span className="text-[10px] text-slate-400 italic">{meta.desc}</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-700 transition-colors ml-2 rounded-full hover:bg-white/70 p-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 space-y-3">

            {/* ── Phonetic Comparison ── */}
            {(word.phoneticsActual || word.phoneticsTarget) && (
              <div className="grid grid-cols-2 gap-2">
                {word.phoneticsActual && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                    <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider mb-1">You Said</p>
                    <p className="font-mono text-red-700 font-bold text-sm">{word.phoneticsActual}</p>
                  </div>
                )}
                {word.phoneticsTarget && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Should Be</p>
                    <p className="font-mono text-emerald-700 font-bold text-sm">{word.phoneticsTarget}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Audio Playback Buttons ── */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePlayUser}
                disabled={!audioUrl}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all duration-200 group
                  ${userAudioState === "playing" ? "border-orange-400 bg-orange-50 shadow-md shadow-orange-200/50"
                  : userAudioState === "loading" ? "border-orange-300 bg-orange-50/20"
                  : audioUrl ? "border-slate-200 bg-slate-50 hover:border-orange-300 hover:bg-orange-50/50"
                  : "border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed"}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all
                  ${userAudioState === "playing" ? "bg-orange-500 scale-105"
                  : userAudioState === "loading" ? "bg-orange-400"
                  : "bg-slate-300 group-hover:bg-orange-400"}`}>
                  <AudioIcon state={userAudioState} color="bg-white" />
                </div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  {userAudioState === "loading" ? "Loading..." : "Replay You"}
                </p>
              </button>

              <button
                onClick={handlePlayAI}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all duration-200 group
                  ${aiAudioState === "playing" ? "border-emerald-400 bg-emerald-50 shadow-md shadow-emerald-200/50"
                  : aiAudioState === "loading" ? "border-emerald-300 bg-emerald-50/20"
                  : "border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/50"}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all
                  ${aiAudioState === "playing" ? "bg-emerald-500 scale-105"
                  : aiAudioState === "loading" ? "bg-emerald-400"
                  : "bg-slate-300 group-hover:bg-emerald-400"}`}>
                  <AudioIcon state={aiAudioState} color="bg-white" />
                </div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  {aiAudioState === "loading" ? "Loading..." : "Hear Correct"}
                </p>
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Coach Notes</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

            {/* ── What went wrong ── */}
            {word.issue && (
              <div className={`rounded-xl p-3 border ${meta.bg} ${meta.border}`}>
                <div className="flex items-start gap-2">
                  <svg className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${meta.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  <p className="text-slate-700 text-xs leading-relaxed">{word.issue}</p>
                </div>
              </div>
            )}

            {/* ── How to fix it ── */}
            {word.correction && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-emerald-800 text-[10px] font-bold uppercase tracking-wider mb-0.5">How to fix it</p>
                    <p className="text-slate-800 text-xs font-medium leading-snug">{word.correction}</p>
                  </div>
                </div>
              </div>
            )}

            {!word.issue && !word.correction && (
              <p className="text-slate-400 text-xs italic text-center py-1">
                Try pronouncing each syllable clearly and slowly.
              </p>
            )}

            {/* ── Slim confidence footer ── */}
            <div>
              <div className="flex justify-between text-[9px] text-slate-400 mb-1">
                <span>AI recognition confidence</span>
                <span className="font-bold">{confidencePct}%</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    word.confidence < 0.5 ? "bg-red-400"
                    : word.confidence < 0.65 ? "bg-orange-400"
                    : "bg-yellow-400"
                  }`}
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
            </div>

          </div>
        </div>
      )}
    </span>
  );
}
