"use client";

import { useState, useCallback } from "react";
import { AudioUploader } from "@/components/AudioUploader";
import { AudioRecorder } from "@/components/AudioRecorder";
import { ProgressIndicator } from "@/components/ProgressIndicator";
import { ResultsView } from "@/components/ResultsView";
import type { AnalysisResult } from "@/lib/types";

type InputMode = "upload" | "record";
type AppState = "idle" | "ready" | "analyzing" | "results" | "error";

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [appState, setAppState] = useState<AppState>("idle");
  const [audioFile, setAudioFile] = useState<File | Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [audioName, setAudioName] = useState<string>("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [inputError, setInputError] = useState<string>("");

  const handleFileSelected = useCallback((file: File, duration: number) => {
    setAudioFile(file);
    setAudioDuration(duration);
    setAudioName(file.name);
    setInputError("");
    setAppState("ready");
  }, []);

  const handleRecordingComplete = useCallback((blob: Blob, duration: number) => {
    setAudioFile(blob);
    setAudioDuration(duration);
    setAudioName(`recording-${new Date().toISOString().slice(0, 19)}.webm`);
    setInputError("");
    setAppState("ready");
  }, []);

  const handleInputError = useCallback((err: string) => {
    setInputError(err);
    setAppState("idle");
    setAudioFile(null);
    setAudioDuration(null);
  }, []);

  const handleSubmit = async () => {
    if (!audioFile || !consentChecked) return;

    setAppState("analyzing");
    setErrorMessage("");

    try {
      const form = new FormData();
      form.append("audio", audioFile instanceof File ? audioFile : new File([audioFile], audioName, { type: "audio/webm" }));
      form.append("consent", "true");

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed. Please try again.");
      }

      setResult(data as AnalysisResult);
      setAppState("results");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
      setAppState("error");
    }
  };

  const handleReset = () => {
    setAppState("idle");
    setAudioFile(null);
    setAudioDuration(null);
    setAudioName("");
    setConsentChecked(false);
    setResult(null);
    setErrorMessage("");
    setInputError("");
  };

  return (
    <main className="min-h-screen" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 40%, #e2e8f0 100%)" }}>
      {/* Background decorative blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-sky-400/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-40 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-violet-400/10 rounded-full blur-3xl" />
      </div>

      <div className={`relative z-10 mx-auto px-4 py-12 transition-all duration-500 ${
        appState === "results" ? "max-w-4xl" : "max-w-2xl"
      }`}>
        {/* Header */}
        <div className="text-center mb-10 animate-fade-in">

          <h1 className="text-4xl sm:text-5xl font-bold mb-4 leading-tight">
            <span className="text-slate-800">Improve Your </span>
            <span className="gradient-text">English Pronunciation</span>
          </h1>
          <p className="text-slate-600 text-lg max-w-lg mx-auto leading-relaxed">
            Upload or record 30–45 seconds of English speech and get word-by-word
            pronunciation feedback powered by AI.
          </p>
        </div>

        {/* Main card */}
        {appState === "results" && result ? (
          <ResultsView result={result} onReset={handleReset} audioFile={audioFile} />
        ) : (
          <div className="glass rounded-3xl p-6 sm:p-8 animate-slide-up shadow-md">
            {/* Analyzing state */}
            {appState === "analyzing" && (
              <ProgressIndicator isActive={true} />
            )}

            {/* Error state */}
            {appState === "error" && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-slate-800 font-semibold text-lg mb-2">Analysis Failed</h3>
                  <p className="text-slate-600 text-sm">{errorMessage}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold relative z-10"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Upload / Record form */}
            {(appState === "idle" || appState === "ready") && (
              <div className="space-y-6">
                {/* Mode tabs */}
                <div className="flex bg-slate-200/60 rounded-xl p-1">
                  {(["upload", "record"] as InputMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setInputMode(mode);
                        setAudioFile(null);
                        setAudioDuration(null);
                        setAppState("idle");
                        setInputError("");
                      }}
                      className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                        inputMode === mode
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {mode === "upload" ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                          </svg>
                          Upload File
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                            <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                          </svg>
                          Record Live
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Input error */}
                {inputError && (
                  <div className="flex items-start gap-3 p-4 bg-red-500/5 border border-red-500/10 rounded-xl animate-fade-in">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <p className="text-red-600 text-sm">{inputError}</p>
                  </div>
                )}

                {/* Upload or Record component */}
                {inputMode === "upload" ? (
                  <AudioUploader
                    onFileSelected={handleFileSelected}
                    onError={handleInputError}
                    disabled={false}
                  />
                ) : (
                  <AudioRecorder
                    onRecordingComplete={handleRecordingComplete}
                    onError={handleInputError}
                    disabled={false}
                  />
                )}



                {/* Consent checkbox */}
                <label className="flex items-start gap-3 cursor-pointer group" htmlFor="consent-checkbox">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      id="consent-checkbox"
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                      consentChecked
                        ? "bg-sky-500 border-sky-500"
                        : "bg-transparent border-slate-300 group-hover:border-slate-400"
                    }`}>
                      {consentChecked && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-slate-500 text-sm leading-relaxed">
                    I consent to my voice recording being processed for pronunciation analysis.
                    This audio is <strong className="text-slate-700">not stored</strong> and is
                    deleted immediately after processing.
                  </span>
                </label>

                {/* Privacy Notice */}
                <div className="p-4 bg-slate-50/50 border border-slate-200 rounded-xl">
                  <div className="flex gap-2.5">
                    <svg className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                    </svg>
                    <div>
                      <p className="text-slate-700 text-xs font-semibold mb-1">Privacy Notice</p>
                      <p className="text-slate-500 text-xs leading-relaxed">
                        Your audio recording is collected solely for pronunciation scoring. It is
                        processed in-memory and never stored on our servers or any database.
                        Audio is sent to secure cloud transcription services for
                        speech transcription and flagged words (text only) to our AI feedback engines
                        for pronunciation coaching tips — both secure processors whose servers may be located
                        outside India.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  id="analyze-button"
                  onClick={handleSubmit}
                  disabled={appState !== "ready" || !consentChecked}
                  className="w-full btn-primary py-4 rounded-xl text-base font-semibold relative z-10"
                >
                  {appState === "ready" && consentChecked
                    ? "Analyze My Pronunciation →"
                    : !consentChecked
                    ? "Please accept consent to continue"
                    : "Select or record audio first"}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
