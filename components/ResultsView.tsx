"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, WordResult, ErrorType } from "@/lib/types";
import { WordTooltip } from "./WordTooltip";
import { SpeechWaveCompare } from "./SpeechWaveCompare";

interface ResultsViewProps {
  result: AnalysisResult;
  onReset: () => void;
  audioFile?: File | Blob | null;
}

const scoreColor = (score: number) => {
  if (score >= 85) return { ring: "#16a34a", text: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" };
  if (score >= 65) return { ring: "#d97706", text: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
  return { ring: "#dc2626", text: "text-red-600", bg: "bg-red-50 border-red-200" };
};

/**
 * Returns the CSS class for a flagged word:
 * – Uses error-type class when Claude has classified the error
 * – Falls back to confidence-based class otherwise
 */
const wordFlagClass = (word: WordResult): string => {
  if (word.errorType) return `word-token error-${word.errorType}`;
  if (word.confidence < 0.5) return "word-token flagged-severe";
  if (word.confidence < 0.65) return "word-token flagged-moderate";
  return "word-token flagged-mild";
};

// ── Error Breakdown Panel & Diagnostics ───────────────────────────────────────
const ERROR_TYPE_DIAGNOSTICS: Record<ErrorType, {
  label: string;
  description: string;
  mouthGuide: string;
  mouthIcon: string;
  tip: string;
  color: string;
  bgColor: string;
  dotColor: string;
  textColor: string;
  borderColor: string;
  pillBg: string;
}> = {
  vowel: {
    label: "Vowel Distortion",
    description: "Shifting vowel sounds away from the target vowel height or backness.",
    mouthGuide: "Shape your lips in a relaxed circle. Keep your tongue neutral and jaw halfway open.",
    mouthIcon: "👄",
    tip: "Prolong the vowel sound slightly and focus on throat resonance.",
    color: "#8b5cf6", // Violet
    bgColor: "bg-violet-50/50",
    dotColor: "bg-violet-500",
    textColor: "text-violet-700",
    borderColor: "border-violet-200",
    pillBg: "bg-violet-50 hover:bg-violet-100",
  },
  consonant: {
    label: "Consonant Mismatch",
    description: "Substituting or softening consonant sounds at the start or end of words.",
    mouthGuide: "Place the tip of your tongue against the upper teeth ridge and release air sharply.",
    mouthIcon: "👅",
    tip: "Exaggerate the release of air on stops like /t/, /d/, /p/, and /b/.",
    color: "#6366f1", // Indigo
    bgColor: "bg-indigo-50/50",
    dotColor: "bg-indigo-500",
    textColor: "text-indigo-700",
    borderColor: "border-indigo-200",
    pillBg: "bg-indigo-50 hover:bg-indigo-100",
  },
  stress: {
    label: "Syllable Emphasis",
    description: "Placing emphasis or pitch stress on the incorrect syllable.",
    mouthGuide: "Elevate your pitch, extend vowel length, and increase volume on the stressed syllable.",
    mouthIcon: "🗣️",
    tip: "Make the stressed syllable twice as long and loud as the unstressed ones.",
    color: "#0ea5e9", // Sky Blue
    bgColor: "bg-sky-50/50",
    dotColor: "bg-sky-500",
    textColor: "text-sky-700",
    borderColor: "border-sky-200",
    pillBg: "bg-sky-50 hover:bg-sky-100",
  },
  omission: {
    label: "Sound Omission",
    description: "Dropping consonant clusters or weak syllables entirely.",
    mouthGuide: "Slow down your speech pacing. Ensure your vocal cords vibrate through the entire word.",
    mouthIcon: "💨",
    tip: "Pronounce every single syllable as a distinct beat before blending them.",
    color: "#0d9488", // Teal
    bgColor: "bg-teal-50/50",
    dotColor: "bg-teal-500",
    textColor: "text-teal-700",
    borderColor: "border-teal-200",
    pillBg: "bg-teal-50 hover:bg-teal-100",
  },
  insertion: {
    label: "Extra Insertion",
    description: "Adding unwritten vowel transitions between consonant clusters.",
    mouthGuide: "Slide directly from the first consonant shape to the next without opening your jaw.",
    mouthIcon: "🔗",
    tip: "Keep your tongue in contact with the mouth roof to bind sounds tightly.",
    color: "#d946ef", // Fuchsia
    bgColor: "bg-fuchsia-50/50",
    dotColor: "bg-fuchsia-500",
    textColor: "text-fuchsia-700",
    borderColor: "border-fuchsia-200",
    pillBg: "bg-fuchsia-50 hover:bg-fuchsia-100",
  },
  unclear: {
    label: "Muffled Articulation",
    description: "Broadly unclear pronunciation, often due to whispering or low volume.",
    mouthGuide: "Open your mouth wider to allow sound waves to project. Project from your diaphragm.",
    mouthIcon: "🎙️",
    tip: "Increase speaking volume slightly and exaggerate mouth shapes.",
    color: "#64748b", // Slate
    bgColor: "bg-slate-50/50",
    dotColor: "bg-slate-500",
    textColor: "text-slate-700",
    borderColor: "border-slate-200",
    pillBg: "bg-slate-50 hover:bg-slate-100",
  },
};

// Legacy color mapping compatibility for other views if needed
const ERROR_TYPE_META = ERROR_TYPE_DIAGNOSTICS;

function ErrorBreakdown({ words }: { words: WordResult[] }) {
  const flagged = words.filter((w) => w.flagged);
  const [activeType, setActiveType] = useState<ErrorType | null>(null);

  if (flagged.length === 0) return null;

  // Count errors by type
  const counts: Partial<Record<ErrorType, WordResult[]>> = {};
  const unclassified: WordResult[] = [];

  for (const w of flagged) {
    if (w.errorType) {
      if (!counts[w.errorType]) counts[w.errorType] = [];
      counts[w.errorType]!.push(w);
    } else {
      unclassified.push(w);
    }
  }
  if (unclassified.length > 0) {
    counts["unclear"] = [...(counts["unclear"] ?? []), ...unclassified];
  }

  const entries = Object.entries(counts) as [ErrorType, WordResult[]][];
  if (entries.length === 0) return null;

  // Select first available category as default active
  const currentActive = activeType && counts[activeType] ? activeType : entries[0][0];
  const activeDiag = ERROR_TYPE_DIAGNOSTICS[currentActive];
  const activeWordsList = counts[currentActive] || [];

  return (
    <div className="space-y-4">
      {/* Accent Diagnostics Heading */}
      <div className="flex items-center gap-2 mb-1 px-1">
        <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100/50">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v17.792m0-17.792L19.5 8.25M9.75 3.104 3 8.25m6.75 12.646L19.5 15.75M9.75 20.75 3 15.75" />
          </svg>
        </div>
        <h3 className="font-extrabold text-slate-800 text-sm tracking-tight">Accent Diagnostics Console</h3>
        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
          {flagged.length} word{flagged.length !== 1 ? "s" : ""} flagged
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Left Column: Diagnostics Ring and Clickable List */}
        <div className="col-span-1 md:col-span-7 glass rounded-2xl p-5 shadow-sm border border-slate-200/60 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            
            {/* SVG Concentric Ring Radar */}
            <div className="relative w-36 h-36 flex-shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                {entries.map(([type, ws], idx) => {
                  const diag = ERROR_TYPE_DIAGNOSTICS[type];
                  const radius = 68 - idx * 10;
                  const circ = 2 * Math.PI * radius;
                  const pct = Math.min(ws.length / flagged.length, 1);
                  const offset = circ - pct * circ;
                  const isActive = currentActive === type;

                  return (
                    <g key={type} className="transition-all duration-300">
                      {/* Gray track background */}
                      <circle
                        cx="80"
                        cy="80"
                        r={radius}
                        fill="transparent"
                        stroke="#f1f5f9"
                        strokeWidth="5"
                      />
                      {/* Active highlighted track glow */}
                      {isActive && (
                        <circle
                          cx="80"
                          cy="80"
                          r={radius}
                          fill="transparent"
                          stroke={diag.color}
                          strokeWidth="8"
                          opacity="0.12"
                        />
                      )}
                      {/* Colored progress sector */}
                      <circle
                        cx="80"
                        cy="80"
                        r={radius}
                        fill="transparent"
                        stroke={diag.color}
                        strokeWidth={isActive ? "7" : "5"}
                        strokeDasharray={circ}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        className="transition-all duration-500 cursor-pointer"
                        onClick={() => setActiveType(type)}
                      />
                    </g>
                  );
                })}
              </svg>
              {/* Center Icon */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xl animate-pulse" style={{ color: activeDiag.color }}>{activeDiag.mouthIcon}</span>
              </div>
            </div>

            {/* Clickable List */}
            <div className="flex-1 space-y-2 w-full">
              {entries.map(([type, ws]) => {
                const diag = ERROR_TYPE_DIAGNOSTICS[type];
                const isActive = currentActive === type;
                const sharePct = Math.round((ws.length / flagged.length) * 100);

                return (
                  <div
                    key={type}
                    onClick={() => setActiveType(type)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all duration-200
                      ${isActive
                        ? "bg-white border-slate-200/80 shadow-md shadow-slate-100 scale-[1.01]"
                        : "bg-slate-50/50 border-slate-200/60 hover:bg-slate-50 hover:border-slate-300"}`}
                    style={isActive ? { borderLeft: `4px solid ${diag.color}` } : {}}
                  >
                    <span className={`w-2 h-2 rounded-full ${diag.dotColor} flex-shrink-0`} />
                    <span className={`text-xs font-bold ${isActive ? "text-slate-800" : "text-slate-600"}`}>
                      {diag.label}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold ml-auto">{sharePct}% share</span>
                    <span 
                      className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${diag.color}15`,
                        color: diag.color
                      }}
                    >
                      {ws.length}
                    </span>
                  </div>
                );
              })}
            </div>

          </div>

          <p className="text-[10px] text-slate-400 mt-4 italic text-center sm:text-left border-t border-slate-100 pt-3">
            Select a diagnostic category to spotlight coaching tips and mouth positions.
          </p>
        </div>

        {/* Right Column: Focus Spotlight Card (Interactive Pronunciation Coach) */}
        <div className="col-span-1 md:col-span-5 glass rounded-2xl p-5 shadow-sm border border-slate-200/60 relative overflow-hidden transition-all duration-300">
          {/* Top colored accent stripe */}
          <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: activeDiag.color }} />
          {/* Subtle color glow orb */}
          <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-15 pointer-events-none" style={{ backgroundColor: activeDiag.color }} />

          <div className="flex items-center gap-3 mb-3 relative z-10">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm font-bold text-lg transition-colors"
              style={{
                backgroundColor: `${activeDiag.color}15`,
                borderColor: `${activeDiag.color}35`,
                color: activeDiag.color
              }}
            >
              {activeDiag.mouthIcon}
            </div>
            <div>
              <h4 className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                COACH SPOTLIGHT
              </h4>
              <span className="text-sm font-extrabold text-slate-800 tracking-tight block mt-1">
                {activeDiag.label}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-600 font-medium mb-3.5 leading-relaxed relative z-10">
            {activeDiag.description}
          </p>

          {/* Mouth Mechanics Guide */}
          <div className="bg-white/80 border border-slate-200/55 rounded-xl p-3 mb-3.5 shadow-sm relative z-10">
            <h5 className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <span>👄</span> MOUTH MECHANICS
            </h5>
            <p className="text-xs text-slate-700 font-medium leading-relaxed">
              {activeDiag.mouthGuide}
            </p>
          </div>

          {/* Quick Practice Drill (Flagged Words Cloud) */}
          <div className="mb-4 relative z-10">
            <h5 className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">
              🚨 TARGET PRACTICE DRILL
            </h5>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {activeWordsList.map((w, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all duration-200"
                  style={{
                    backgroundColor: `${activeDiag.color}08`,
                    borderColor: `${activeDiag.color}25`,
                    color: activeDiag.color
                  }}
                >
                  <span>{w.text}</span>
                  {w.phoneticsTarget && (
                    <span className="text-[9px] opacity-75 font-mono">→ {w.phoneticsTarget}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actionable coaching verdict */}
          <div className="bg-white/50 border border-slate-100 rounded-xl p-3 relative z-10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Coaching Tip</p>
            <p className="text-xs font-semibold text-slate-800 leading-snug">{activeDiag.tip}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number; color: string }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const arcLength = 356.0; // Circumference (2 * pi * 85) * (240 / 360)
  const [offset, setOffset] = useState(arcLength);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 1400;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * score);
      setAnimatedScore(current);
      setOffset(arcLength - (current / 100) * arcLength);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [score]);

  return (
    <div className="flex flex-col items-center select-none mx-auto w-72">
      {/* SVG Gauge Container */}
      <div className="relative w-full h-[220px]">
        <svg className="w-full h-full" viewBox="0 0 280 220">
          <defs>
            {/* Main gauge gradient */}
            <linearGradient id="gaugeGradient" x1="0%" y1="100%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" /> {/* Purple */}
              <stop offset="50%" stopColor="#6366f1" /> {/* Indigo */}
              <stop offset="100%" stopColor="#0ea5e9" /> {/* Sky Blue */}
            </linearGradient>

            {/* Text path definition concentric to the gauge (r = 105) */}
            <path
              id="textArcPath"
              d="M 44.84 164.37 A 105 105 0 1 1 235.16 164.37"
              fill="none"
            />
          </defs>

          {/* Celebratory confetti elements in background */}
          <g className="opacity-70">
            <rect x="25" y="110" width="4" height="4" transform="rotate(45 25 110)" fill="#f43f5e" />
            <circle cx="35" cy="55" r="2.5" fill="#3b82f6" />
            <rect x="65" y="35" width="3" height="6" transform="rotate(15 65 35)" fill="#eab308" />
            <circle cx="205" cy="30" r="2.5" fill="#10b981" />
            <rect x="245" y="65" width="5" height="2" transform="rotate(30 245 65)" fill="#ec4899" />
            <circle cx="240" cy="130" r="1.5" fill="#6366f1" />
            <rect x="75" y="170" width="4" height="4" transform="rotate(45 75 170)" fill="#f43f5e" />
            <circle cx="195" cy="175" r="2" fill="#0ea5e9" />
          </g>

          {/* Curved labels along textArcPath */}
          <text className="text-[9px] font-extrabold tracking-[0.2em] fill-slate-400 select-none">
            <textPath href="#textArcPath" startOffset="6%">PRACTICE</textPath>
            <textPath href="#textArcPath" startOffset="50%" textAnchor="middle">GREAT</textPath>
            <textPath href="#textArcPath" startOffset="94%" textAnchor="end">EXCELLENT</textPath>
          </text>

          {/* Track (Background Semicircular Arc) */}
          <path
            d="M 66.39 162.5 A 85 85 0 1 1 213.61 162.5"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="14"
            strokeLinecap="round"
          />

          {/* Colored Progress Arc */}
          <path
            d="M 66.39 162.5 A 85 85 0 1 1 213.61 162.5"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.05s linear" }}
          />
        </svg>

        {/* Inner Score Display Card (Soft 3D / Glassmorphism circle) */}
        <div className="absolute top-[72px] left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-white shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center justify-center">
          <span className="text-4xl font-extrabold text-slate-800 tabular-nums tracking-tight">
            {animatedScore}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold mt-0.5">/ 100</span>
        </div>
      </div>

      {/* Under-badge (Separated below) */}
      <div className="mt-2 mb-4">
        <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100/50 text-[10px] font-extrabold tracking-wider text-indigo-600 uppercase shadow-sm">
          PRONUNCIATION SCORE
        </span>
      </div>
    </div>
  );
}

export function ResultsView({ result, onReset, audioFile }: ResultsViewProps) {
  // Compute which error types are actually present in this result
  const presentErrorTypes = Array.from(
    new Set(result.words.filter((w) => w.flagged && w.errorType).map((w) => w.errorType as ErrorType))
  );
  const colors = scoreColor(result.overallScore);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [showEnhancer, setShowEnhancer] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!audioFile) return;
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  // Reset playback if audioUrl changes
  useEffect(() => {
    // If audioUrl changes, we can perform any general reset if needed
  }, [audioUrl]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Score Header */}
      <div className="glass rounded-3xl p-8 shadow-sm relative overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Semicircular Gauge */}
          <div className="col-span-1 md:col-span-5 text-center flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-200/80 pb-6 md:pb-0 md:pr-8">
            <ScoreRing score={result.overallScore} color={colors.ring} />

            <div className="mt-2 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Performance</span>
              <h2 className={`text-3xl font-extrabold ${colors.text} tracking-tight`}>{result.qualityLabel}</h2>
            </div>
          </div>

          {/* Right Column: Premium Sub-scores Widgets */}
          <div className="col-span-1 md:col-span-7 flex flex-col justify-center space-y-5">
            
            {/* Clarity Sub-score Panel */}
            <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-5 hover:border-sky-300 transition-all duration-300 flex items-center justify-between group shadow-sm">
              <div className="space-y-1.5 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clarity Score</span>
                </div>
                <p className="text-xs text-slate-400">Measures the phonetic precision of individual words and syllables. (70% weight)</p>
                
                {/* Mini progress bar */}
                <div className="pt-2">
                  <div className="h-2 bg-slate-200/80 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-sky-500 rounded-full transition-all duration-1000"
                      style={{ width: `${result.clarityScore}%` }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <span className="text-4xl font-extrabold text-slate-800 tabular-nums">{result.clarityScore}</span>
                <span className="text-xs text-slate-400 font-semibold block mt-0.5">/100</span>
              </div>
            </div>

            {/* Fluency Sub-score Panel */}
            <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-5 hover:border-indigo-300 transition-all duration-300 flex items-center justify-between group shadow-sm">
              <div className="space-y-1.5 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fluency Score</span>
                </div>
                <p className="text-xs text-slate-400">Measures the rhythm, pacing, and presence of unnatural speech pauses. (30% weight)</p>
                
                {/* Mini progress bar */}
                <div className="pt-2">
                  <div className="h-2 bg-slate-200/80 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                      style={{ width: `${result.fluencyScore}%` }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <span className="text-4xl font-extrabold text-slate-800 tabular-nums">{result.fluencyScore}</span>
                <span className="text-xs text-slate-400 font-semibold block mt-0.5">/100</span>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Summary */}
      <div className={`glass rounded-2xl p-6 border ${colors.bg} shadow-sm`}>
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
          </svg>
          Summary
        </h3>
        <div className="space-y-2">
          <p className="text-slate-600 text-sm">
            <span className="font-semibold text-slate-800">{result.flaggedCount}</span>{" "}
            word{result.flaggedCount !== 1 ? "s" : ""} flagged out of{" "}
            <span className="font-semibold text-slate-800">{result.words.length}</span> total
          </p>
          <p className="text-slate-600 text-sm">{result.fluencyNotes.comment}</p>
          {result.fluencyNotes.pauseCount > 0 && (
            <p className="text-slate-500 text-xs">
              Avg gap between words: {(result.fluencyNotes.avgPause * 1000).toFixed(0)}ms
            </p>
          )}
        </div>
      </div>

      {/* Transcript with highlighting */}
      <div className="glass rounded-2xl p-6 shadow-sm relative z-30" ref={transcriptRef}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
              Transcript
            </h3>
            {audioFile && (
              <button
                onClick={() => setShowEnhancer(!showEnhancer)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  showEnhancer
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                }`}
                title="AI Speech Enhancer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.187-.813L9 9l.813 5.187L15 15l-5.187.813zM19.071 4.929l-.707 1.414-.707-1.414 1.414-.707-.707-.707-.707.707-.707-.707.707-.707 1.414.707z" />
                </svg>
                <span>AI Enhance</span>
              </button>
            )}
          </div>
          {presentErrorTypes.length > 0 && (
            <div className="flex items-center gap-3 text-xs font-medium flex-wrap">
              {presentErrorTypes.map((type) => {
                const m = ERROR_TYPE_META[type];
                return (
                  <span key={type} className={`flex items-center gap-1.5 ${m.textColor}`}>
                    <span className={`w-2.5 h-0.5 rounded ${m.dotColor}${type === "stress" ? " border-b border-dashed border-amber-500" : ""}`} />
                    {m.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {showEnhancer && audioFile ? (
          <SpeechWaveCompare
            audioFile={audioFile}
            words={result.words}
            textToSpeak={result.nvidiaPolished || result.transcript}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap border-b border-slate-100 pb-3">
              <p className="text-xs text-slate-400 italic">
                Click highlighted words for pronunciation details and audio playback
              </p>
            </div>

            <div className="text-slate-700 leading-relaxed text-base font-normal" style={{ lineHeight: "2.4" }}>
              {result.words.map((word, idx) => {
                if (word.flagged) {
                  return (
                    <WordTooltip key={idx} word={word} audioUrl={audioUrl}>
                      <span className={wordFlagClass(word)}>
                        {word.text}
                      </span>
                    </WordTooltip>
                  );
                }
                return (
                  <span key={idx} className="word-token">
                    {word.text}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Error Breakdown Panel */}
      {result.words.some((w) => w.flagged) && (
        <ErrorBreakdown words={result.words} />
      )}

      {/* Nvidia AI Summary & Context */}
      {result.nvidiaSummary && (
        <div className="glass rounded-2xl p-6 border border-sky-500/20 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            Overall Feedback & Summary
          </h3>
          <p className="text-slate-600 text-sm leading-relaxed">
            {result.nvidiaSummary}
          </p>
        </div>
      )}

      {/* Nvidia Tips section */}
      {result.nvidiaTips && result.nvidiaTips.length > 0 ? (
        <div className="glass rounded-2xl p-6 border border-indigo-500/20 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            Actionable Pronunciation Tips
          </h3>
          <ul className="space-y-3 text-sm text-slate-600">
            {result.nvidiaTips.map((tip, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-indigo-600 flex-shrink-0">→</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        /* Fallback default tips section */
        result.flaggedCount > 0 && (
          <div className="glass rounded-2xl p-6 border border-sky-500/20 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
              </svg>
              Practice Tips
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex gap-2">
                <span className="text-sky-600 flex-shrink-0">→</span>
                Click each highlighted word above to see specific feedback
              </li>
              <li className="flex gap-2">
                <span className="text-sky-600 flex-shrink-0">→</span>
                Record yourself again after practicing flagged words
              </li>
              <li className="flex gap-2">
                <span className="text-sky-600 flex-shrink-0">→</span>
                Focus on one sound at a time — slow, exaggerated practice helps
              </li>
            </ul>
          </div>
        )
      )}

      {/* Try again */}
      <button
        onClick={onReset}
        className="w-full btn-primary py-3.5 rounded-xl text-sm font-semibold relative z-10 animate-fade-in"
      >
        Analyze Another Recording
      </button>
    </div>
  );
}
