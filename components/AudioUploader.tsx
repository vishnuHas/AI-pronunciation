"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

interface AudioUploaderProps {
  onFileSelected: (file: File, duration: number) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

const MIN_DURATION = 30;
const MAX_DURATION = 45;

async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load audio file"));
    };
    audio.src = url;
  });
}

export function AudioUploader({ onFileSelected, onError, disabled }: AudioUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      setChecking(true);
      setSelectedFile(null);
      setDuration(null);

      try {
        const dur = await getAudioDuration(file);
        setDuration(dur);
        setSelectedFile(file);

        if (dur < MIN_DURATION) {
          onError(
            `Audio is too short (${dur.toFixed(1)}s). Please use a clip between 30 and 45 seconds.`
          );
          return;
        }
        if (dur > MAX_DURATION) {
          onError(
            `Audio is too long (${dur.toFixed(1)}s). Please use a clip between 30 and 45 seconds.`
          );
          return;
        }

        onFileSelected(file, dur);
      } catch {
        onError("Could not read audio file. Please ensure it is a valid audio file.");
      } finally {
        setChecking(false);
      }
    },
    [onFileSelected, onError]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: {
      "audio/mpeg": [".mp3"],
      "audio/wav": [".wav"],
      "audio/x-m4a": [".m4a"],
      "audio/mp4": [".m4a"],
      "audio/webm": [".webm"],
    },
    multiple: false,
    disabled,
    onDropAccepted: ([file]) => processFile(file),
    onDropRejected: () =>
      onError("Unsupported format. Please upload an MP3, WAV, M4A, or WebM file."),
  });

  const durationLabel =
    duration !== null
      ? duration < MIN_DURATION
        ? "too short"
        : duration > MAX_DURATION
        ? "too long"
        : "✓ duration OK"
      : null;

  const durationColor =
    duration !== null
      ? duration < MIN_DURATION || duration > MAX_DURATION
        ? "text-red-500"
        : "text-emerald-600"
      : "";

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`
          relative rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer
          transition-all duration-300 select-none
          ${isDragActive && !isDragReject ? "dropzone-active border-sky-500" : "border-slate-300 hover:border-slate-400"}
          ${isDragReject ? "border-red-500 bg-red-50" : ""}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${!isDragActive && !disabled ? "hover:bg-slate-50" : ""}
        `}
      >
        <input {...getInputProps()} />

        {/* Upload Icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-16 h-16 flex items-center justify-center transition-all duration-300 ${isDragActive ? "scale-110" : ""}`}>
            <img
              src="/audio-file-icon.png"
              alt="Audio file icon"
              className="w-16 h-16 object-contain"
            />
          </div>
        </div>

        {checking ? (
          <div className="space-y-2">
            <p className="text-slate-700 font-medium">Checking audio…</p>
            <div className="h-1 w-32 mx-auto bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-sky-500 rounded-full shimmer" style={{ width: "60%" }} />
            </div>
          </div>
        ) : selectedFile && duration !== null ? (
          <div className="space-y-1">
            <p className="text-slate-800 font-semibold text-sm truncate max-w-xs mx-auto">
              {selectedFile.name}
            </p>
            <div className="flex items-center justify-center gap-3 text-sm">
              <span className="text-slate-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </span>
              <span className="text-slate-400">•</span>
              <span className={`font-medium ${durationColor}`}>
                {duration.toFixed(1)}s — {durationLabel}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-slate-700 font-semibold">
              {isDragActive ? "Drop your audio here" : "Drag & drop your audio"}
            </p>
            <p className="text-slate-500 text-sm">
              or <span className="text-sky-600 font-medium">click to browse</span>
            </p>
            <p className="text-slate-400 text-xs mt-3">
              MP3, WAV, M4A, WebM · 30–45 seconds
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
