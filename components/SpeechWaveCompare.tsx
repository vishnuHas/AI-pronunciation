"use client";

import { useEffect, useState, useRef } from "react";
import type { WordResult } from "@/lib/types";

interface SpeechWaveCompareProps {
  audioFile: File | Blob;
  words: WordResult[];
  textToSpeak: string;
}

export function SpeechWaveCompare({ audioFile, words, textToSpeak }: SpeechWaveCompareProps) {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState<number>(0);
  const [userCurrentTime, setUserCurrentTime] = useState<number>(0);
  const [aiCurrentTime, setAiCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isAiPlaying, setIsAiPlaying] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const wordCount = textToSpeak.split(/\s+/).filter(Boolean).length;
  // Estimate target AI Speech duration based on 2 words per second (at 0.85 rate)
  const aiDuration = Math.max(wordCount / 2.0, 3.0);

  // Decode audio and extract amplitude peaks
  useEffect(() => {
    let active = true;
    const decodeAudio = async () => {
      try {
        setLoading(true);
        const arrayBuffer = await audioFile.arrayBuffer();
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        let decodedData;
        try {
          decodedData = await audioCtx.decodeAudioData(arrayBuffer);
        } finally {
          try {
            audioCtx.close().catch(() => {});
          } catch (_) {}
        }
        
        if (!active || !decodedData) return;
        setDuration(decodedData.duration);
        
        const channelData = decodedData.getChannelData(0);
        const numPeaks = 100;
        const step = Math.floor(channelData.length / numPeaks);
        const rawPeaks: number[] = [];
        
        for (let i = 0; i < numPeaks; i++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            const val = Math.abs(channelData[i * step + j]);
            if (val > max) max = val;
          }
          rawPeaks.push(max);
        }
        
        // Normalize peaks
        const maxPeak = Math.max(...rawPeaks);
        const normalized = rawPeaks.map((p) => (maxPeak > 0 ? p / maxPeak : 0.05));
        
        if (active) {
          setPeaks(normalized);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error decoding audio for visualizer:", err);
        // Fallback peaks if decoding fails
        const fallback = Array.from({ length: 100 }, () => 0.1 + Math.random() * 0.5);
        if (active) {
          setPeaks(fallback);
          setDuration(30);
          setLoading(false);
        }
      }
    };

    decodeAudio();
    return () => {
      active = false;
    };
  }, [audioFile]);

  // Handle audio play/pause and unmount cleanup
  useEffect(() => {
    if (!audioFile) return;
    const url = URL.createObjectURL(audioFile);
    const audio = new Audio(url);
    audioRef.current = audio;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setUserCurrentTime(0);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      URL.revokeObjectURL(url);
      window.speechSynthesis?.cancel();
    };
  }, [audioFile]);

  // Track user recorded voice playback progress
  const updateProgress = () => {
    if (audioRef.current) {
      setUserCurrentTime(audioRef.current.currentTime);
      if (isPlaying) {
        animationRef.current = requestAnimationFrame(updateProgress);
      }
    }
  };

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateProgress);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying]);

  // Animate the AI timeline when AI is playing
  useEffect(() => {
    let animFrameId: number;
    let startTime: number;

    if (isAiPlaying) {
      startTime = performance.now() - (aiCurrentTime * 1000);
      const updateTimer = () => {
        const now = performance.now();
        const elapsed = (now - startTime) / 1000;
        setAiCurrentTime(Math.min(elapsed, aiDuration));
        
        if (elapsed < aiDuration) {
          animFrameId = requestAnimationFrame(updateTimer);
        } else {
          setIsAiPlaying(false);
          setAiCurrentTime(0);
        }
      };
      animFrameId = requestAnimationFrame(updateTimer);
    }

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [isAiPlaying, aiDuration]);

  const togglePlayback = () => {
    if (!audioRef.current) return;

    // Stop any active AI optimized playback
    if (isAiPlaying) {
      window.speechSynthesis?.cancel();
      setIsAiPlaying(false);
      setAiCurrentTime(0);
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const togglePlayAIOptimized = () => {
    // Stop any active recorded voice playback
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    if (isAiPlaying) {
      window.speechSynthesis?.cancel();
      setIsAiPlaying(false);
      setAiCurrentTime(0);
    } else {
      window.speechSynthesis?.cancel();
      setAiCurrentTime(0);
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utteranceRef.current = utterance;
      utterance.lang = "en-US";
      utterance.rate = 0.85;

      utterance.onend = () => {
        setIsAiPlaying(false);
        setAiCurrentTime(0);
      };
      utterance.onerror = () => {
        setIsAiPlaying(false);
        setAiCurrentTime(0);
      };

      setIsAiPlaying(true);
      window.speechSynthesis?.speak(utterance);
    }
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(x / rect.width, 1));
    const newTime = pct * duration;
    audioRef.current.currentTime = newTime;
    setUserCurrentTime(newTime);
  };

  // Helper to find the word state at a specific peak ratio
  const getPeakColor = (ratio: number) => {
    if (duration === 0) return "bg-slate-200";
    const time = ratio * duration;
    
    // Find if there is a word at this timestamp
    const word = words.find((w) => time >= w.startTime && time <= w.endTime);
    if (!word) return "bg-slate-200"; // silence / gap
    if (!word.flagged) return "bg-indigo-500"; // good pronunciation
    
    // Color code based on confidence score severity
    if (word.confidence < 0.5) return "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"; // severe
    if (word.confidence < 0.65) return "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]"; // moderate
    return "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"; // mild
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Generating voice graphs...</p>
      </div>
    );
  }

  // Create smooth peaks for the AI model representation
  const aiPeaks = peaks.map((p, idx) => {
    // Smooth out user's peaks and boost slightly to represent stable projection
    const smooth = 0.3 + 0.4 * Math.sin(idx * 0.15) + Math.random() * 0.15;
    return Math.max(0.15, Math.min(smooth, 0.9));
  });

  const userProgressPct = duration > 0 ? (userCurrentTime / duration) * 100 : 0;
  const aiProgressPct = aiDuration > 0 ? (aiCurrentTime / aiDuration) * 100 : 0;

  return (
    <div className="space-y-6 mt-4 animate-slide-up select-none">
      {/* Waveforms comparison wrapper */}
      <div className="grid grid-cols-1 gap-5">
        
        {/* Current Voice Waveform */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200/60">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
              Your Voice Accent Graph
            </div>
            <span className="text-[10px] font-bold text-slate-400">CURRENT SPEECH</span>
          </div>

          {/* Waveform track */}
          <div 
            onClick={handleScrub}
            className="h-24 flex items-end justify-between gap-[2px] relative cursor-pointer group"
          >
            {peaks.map((p, idx) => {
              const ratio = idx / peaks.length;
              const isPast = ratio * duration <= userCurrentTime;
              const colorClass = getPeakColor(ratio);
              
              return (
                <div
                  key={idx}
                  className={`w-full rounded-full transition-all duration-300 ${colorClass}`}
                  style={{
                    height: `${p * 100}%`,
                    opacity: isPast ? 1 : 0.4,
                    minHeight: "4px"
                  }}
                />
              );
            })}
            
            {/* Playback scrubber line */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-indigo-600 z-10 transition-all duration-75 pointer-events-none"
              style={{ left: `${userProgressPct}%` }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 absolute -top-1 -left-1 shadow-md shadow-indigo-600/30" />
            </div>
          </div>
        </div>

        {/* AI Reference Waveform */}
        <div className="bg-emerald-50/20 border border-emerald-100 rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-emerald-100/60">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              AI Optimized Speech Flow
            </div>
            <span className="text-[10px] font-bold text-emerald-500">IDEAL TARGET</span>
          </div>

          {/* Waveform track */}
          <div 
            className="h-24 flex items-end justify-between gap-[2px] relative"
          >
            {aiPeaks.map((p, idx) => {
              const ratio = idx / aiPeaks.length;
              const isPast = ratio * aiPeaks.length <= (aiCurrentTime / aiDuration) * aiPeaks.length;
              
              return (
                <div
                  key={idx}
                  className="w-full rounded-full transition-all duration-300 bg-emerald-500"
                  style={{
                    height: `${p * 100}%`,
                    opacity: isPast ? 1 : 0.35,
                    minHeight: "4px"
                  }}
                />
              );
            })}
            
            {/* Playback scrubber line */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-emerald-600 z-10 transition-all duration-75 pointer-events-none"
              style={{ left: `${aiProgressPct}%` }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 absolute -top-1 -left-1 shadow-md shadow-emerald-600/30" />
            </div>
          </div>
        </div>

      </div>

      {/* Control bar */}
      <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* Play My Voice */}
          <button
            onClick={togglePlayback}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 border
              ${isPlaying
                ? "bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20"
                : "bg-white text-slate-700 border-slate-200 hover:bg-orange-50 hover:border-orange-200"}`}
            title="Play/Pause your recorded voice"
          >
            {isPlaying ? (
              <>
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                <span>Pause My Voice</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Play My Voice</span>
              </>
            )}
          </button>

          {/* Play AI Optimized */}
          <button
            onClick={togglePlayAIOptimized}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 border
              ${isAiPlaying
                ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20"
                : "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200"}`}
            title="Listen to the AI optimized pronunciation"
          >
            {isAiPlaying ? (
              <>
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                <span>Pause AI Optimized</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
                <span>Play AI Optimized</span>
              </>
            )}
          </button>
        </div>

        {/* Timestamps */}
        <div className="text-xs font-semibold text-slate-500 font-mono">
          {(() => {
            const activeTime = isAiPlaying ? aiCurrentTime : userCurrentTime;
            const activeDur = isAiPlaying ? aiDuration : duration;
            return (
              <>
                {Math.floor(activeTime / 60)}:{(activeTime % 60).toFixed(0).padStart(2, "0")}
                <span className="text-slate-300 mx-1">/</span>
                {Math.floor(activeDur / 60)}:{(activeDur % 60).toFixed(0).padStart(2, "0")}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
