"use client";

import { useEffect, useState } from "react";

interface Step {
  label: string;
  sublabel: string;
  duration: number; // approx ms for this step
}

const STEPS: Step[] = [
  { label: "Uploading audio", sublabel: "Sending to server…", duration: 1500 },
  { label: "Transcribing speech", sublabel: "Deepgram nova-2 model is analyzing your recording…", duration: 6000 },
  { label: "Analyzing pronunciation", sublabel: "Checking word confidence scores and phonemes…", duration: 2000 },
  { label: "Generating feedback", sublabel: "Claude AI is crafting personalized explanations…", duration: 4000 },
  { label: "Computing your score", sublabel: "Calculating clarity and fluency metrics…", duration: 1000 },
];

interface ProgressIndicatorProps {
  isActive: boolean;
}

export function ProgressIndicator({ isActive }: ProgressIndicatorProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setCurrentStep(0);
      setStepProgress(0);
      return;
    }

    let stepIdx = 0;
    let startTime = Date.now();

    const tick = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const step = STEPS[stepIdx];
      const progress = Math.min((elapsed / step.duration) * 100, 99);

      setCurrentStep(stepIdx);
      setStepProgress(progress);

      if (elapsed >= step.duration && stepIdx < STEPS.length - 1) {
        stepIdx++;
        startTime = Date.now();
      }
    };

    const interval = setInterval(tick, 50);
    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="glass rounded-2xl p-8 animate-fade-in shadow-sm">
      <div className="flex items-center gap-3 mb-8">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 border-2 border-sky-500/20 rounded-full" />
          <div className="absolute inset-0 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <div>
          <h3 className="text-slate-800 font-semibold">Analyzing your pronunciation</h3>
          <p className="text-slate-500 text-sm">This may take 10–20 seconds</p>
        </div>
      </div>

      <div className="space-y-4">
        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentStep;
          const isActive = idx === currentStep;
          const isPending = idx > currentStep;

          return (
            <div key={step.label} className={`flex items-start gap-4 transition-all duration-500 progress-step ${isActive ? "active" : isCompleted ? "completed" : ""}`}>
              {/* Step indicator */}
              <div className="mt-0.5 flex-shrink-0">
                {isCompleted ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-500 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                ) : isActive ? (
                  <div className="w-6 h-6 rounded-full bg-sky-50 border border-sky-500 flex items-center justify-center">
                    <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                  </div>
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-sm ${isCompleted ? "text-emerald-600" : isActive ? "text-sky-600" : "text-slate-400"}`}>
                  {step.label}
                </p>
                {isActive && (
                  <div className="mt-2 animate-fade-in">
                    <p className="text-slate-500 text-xs mb-2">{step.sublabel}</p>
                    <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-100"
                        style={{ width: `${stepProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                {isPending && (
                  <p className="text-slate-400 text-xs">{step.sublabel}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-slate-400 text-center">
        Your audio is processed securely and never stored
      </p>
    </div>
  );
}
