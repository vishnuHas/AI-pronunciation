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
  const [ageConfirmed, setAgeConfirmed] = useState(false); // DPDP §9 — age gate
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
    if (!audioFile || !consentChecked || !ageConfirmed) return;
    // Log consent timestamp for DPDP auditability (ephemeral — sessionStorage only)
    try {
      sessionStorage.setItem("dpdp_consent_ts", new Date().toISOString());
    } catch { /* ignore if sessionStorage unavailable (SSR / privacy mode) */ }

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
    setAgeConfirmed(false);
    setResult(null);
    setErrorMessage("");
    setInputError("");
    try { sessionStorage.removeItem("dpdp_consent_ts"); } catch { /* ignore */ }
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
            Upload 30–45 seconds of English speech and get word-by-word
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

            {/* Upload form */}
            {(appState === "idle" || appState === "ready") && (
              <div className="space-y-6">
                {/* Input error */}
                {inputError && (
                  <div className="flex items-start gap-3 p-4 bg-red-500/5 border border-red-500/10 rounded-xl animate-fade-in">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <p className="text-red-600 text-sm">{inputError}</p>
                  </div>
                )}

                {/* Upload component only */}
                <AudioUploader
                  onFileSelected={handleFileSelected}
                  onError={handleInputError}
                  disabled={false}
                />



                {/* DPDP Compliance Block */}
                <div className="space-y-3">

                  {/* Consent checkbox — DPDP §7 */}
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
                      deleted immediately after processing. I can withdraw this consent at any time
                      by clicking &ldquo;Analyze Again&rdquo; to reset.
                    </span>
                  </label>

                  {/* Age gate — DPDP §9 */}
                  <label className="flex items-start gap-3 cursor-pointer group" htmlFor="age-checkbox">
                    <div className="relative mt-0.5 flex-shrink-0">
                      <input
                        id="age-checkbox"
                        type="checkbox"
                        checked={ageConfirmed}
                        onChange={(e) => setAgeConfirmed(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                        ageConfirmed
                          ? "bg-indigo-500 border-indigo-500"
                          : "bg-transparent border-slate-300 group-hover:border-slate-400"
                      }`}>
                        {ageConfirmed && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-slate-500 text-sm leading-relaxed">
                      I confirm I am <strong className="text-slate-700">18 years or older</strong>.{" "}
                      <span className="text-slate-400 text-xs">(Required under India&rsquo;s DPDP Act 2023 §9)</span>
                    </span>
                  </label>

                  {/* Privacy Notice — DPDP §9 / §11 */}
                  <div className="p-4 bg-slate-50/50 border border-slate-200 rounded-xl">
                    <div className="flex gap-2.5">
                      <svg className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                      </svg>
                      <div>
                        <p className="text-slate-700 text-xs font-semibold mb-1">Privacy Notice — DPDP Act 2023 Compliant</p>
                        <p className="text-slate-500 text-xs leading-relaxed">
                          Your voice recording is collected <strong className="text-slate-600">solely</strong> for pronunciation scoring.
                          It is processed in-memory on our server and <strong className="text-slate-600">never written to any disk, database, or storage</strong>.
                          The audio buffer is explicitly discarded immediately after transcription completes.{" "}
                          Audio is transmitted to <strong className="text-slate-600">Deepgram Inc.</strong> (USA) for speech-to-text;
                          flagged word text (no audio) is sent to <strong className="text-slate-600">Nvidia Corporation</strong> (USA)
                          for AI coaching tips. Both are cross-border transfers under DPDP §16.
                          No audio, transcripts, or scores are retained after your session ends.
                        </p>
                        <p className="text-slate-400 text-xs mt-1.5">
                          For grievances, contact:{" "}
                          <a href="mailto:privacy@pronounceai.app" className="underline hover:text-slate-600 transition-colors">
                            privacy@pronounceai.app
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Submit button */}
                <button
                  id="analyze-button"
                  onClick={handleSubmit}
                  disabled={appState !== "ready" || !consentChecked || !ageConfirmed}
                  className="w-full btn-primary py-4 rounded-xl text-base font-semibold relative z-10"
                >
                  {appState === "ready" && consentChecked && ageConfirmed
                    ? "Analyze My Pronunciation →"
                    : appState !== "ready"
                    ? "Select or record audio first"
                    : !consentChecked
                    ? "Please accept consent to continue"
                    : "Please confirm your age to continue"}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
