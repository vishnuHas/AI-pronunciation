"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

type RecorderState = "idle" | "requesting" | "recording" | "stopped" | "error";

const TARGET_MIN = 30;
const TARGET_MAX = 45;

export function AudioRecorder({
  onRecordingComplete,
  onError,
  disabled,
}: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    stopTimer();
    setState("stopped");
  }, [stopTimer]);

  // Auto-stop at 45 seconds
  useEffect(() => {
    if (state === "recording" && elapsed >= TARGET_MAX) {
      stopRecording();
    }
  }, [elapsed, state, stopRecording]);

  const startRecording = useCallback(async () => {
    setState("requesting");
    setElapsed(0);
    setAudioBlob(null);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("error");
      onError("Microphone access denied. Please allow microphone access and try again.");
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/ogg";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setAudioBlob(blob);
      const duration = (Date.now() - startTimeRef.current) / 1000;
      stream.getTracks().forEach((t) => t.stop());

      if (duration < TARGET_MIN) {
        onError(
          `Recording too short (${duration.toFixed(1)}s). Please record between 30 and 45 seconds.`
        );
        setState("idle");
        return;
      }
      onRecordingComplete(blob, duration);
    };

    recorder.start(100); // Collect in 100ms chunks
    startTimeRef.current = Date.now();
    setState("recording");

    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - startTimeRef.current) / 1000);
    }, 100);
  }, [onRecordingComplete, onError]);

  useEffect(() => {
    return () => {
      stopTimer();
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stopTimer]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = Math.min((elapsed / TARGET_MAX) * 100, 100);
  const isInRange = elapsed >= TARGET_MIN && elapsed <= TARGET_MAX;

  return (
    <div className="space-y-4">
      <div className={`
        glass rounded-2xl p-6 text-center transition-all duration-300
        ${state === "recording" ? "border-red-300 shadow-sm shadow-red-500/5" : ""}
      `}>
        {/* Mic icon / recording indicator */}
        <div className="flex justify-center mb-4">
          <div className={`
            w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300
            ${state === "recording"
              ? "bg-red-50 border-2 border-red-500"
              : state === "stopped"
              ? "bg-emerald-50 border-2 border-emerald-500"
              : "bg-slate-100 border-2 border-slate-200"}
          `}>
            {state === "recording" ? (
              <div className="relative flex items-center justify-center">
                <div className="absolute w-10 h-10 bg-red-500/10 rounded-full record-pulse" />
                <div className="w-3 h-3 bg-red-500 rounded-sm z-10" />
              </div>
            ) : state === "stopped" ? (
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-7 h-7 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
            )}
          </div>
        </div>

        {/* Timer display */}
        {state === "recording" && (
          <div className="space-y-3 mb-4">
            <div className={`text-4xl font-mono font-bold transition-colors duration-300 ${isInRange ? "text-emerald-600" : "text-slate-700"}`}>
              {formatTime(elapsed)}
            </div>
            <div className="text-sm text-slate-500">
              {elapsed < TARGET_MIN
                ? `Keep going — ${(TARGET_MIN - elapsed).toFixed(0)}s until minimum`
                : elapsed < TARGET_MAX
                ? `✓ Great! You can stop now or continue to ${TARGET_MAX}s`
                : "Auto-stopping…"}
            </div>

            {/* Progress bar */}
            <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden mx-4">
              <div
                className={`absolute h-full rounded-full transition-all duration-100 ${
                  isInRange ? "bg-emerald-500" : "bg-sky-500"
                }`}
                style={{ width: `${progress}%` }}
              />
              {/* MIN marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-slate-300"
                style={{ left: `${(TARGET_MIN / TARGET_MAX) * 100}%` }}
              />
            </div>
          </div>
        )}

        {state === "stopped" && audioBlob && (
          <p className="text-emerald-600 font-medium mb-4">
            Recording complete ✓
          </p>
        )}

        {state === "idle" || state === "stopped" ? (
          <p className="text-slate-500 text-sm mb-4">
            {state === "stopped"
              ? "Record again?"
              : "Record 30–45 seconds of English speech"}
          </p>
        ) : null}

        {/* Controls */}
        <div className="flex justify-center gap-3">
          {state === "idle" || state === "stopped" || state === "error" ? (
            <button
              onClick={startRecording}
              disabled={disabled}
              className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold relative z-10"
            >
              {state === "stopped" ? "Record Again" : "Start Recording"}
            </button>
          ) : state === "recording" ? (
            <button
              onClick={stopRecording}
              className="bg-red-500 hover:bg-red-400 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-red-500/20"
            >
              Stop Recording
            </button>
          ) : (
            <div className="text-slate-500 text-sm">Requesting microphone…</div>
          )}
        </div>
      </div>
    </div>
  );
}
