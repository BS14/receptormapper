"use client";

import { useRef } from "react";

interface FileDropzoneProps {
  label: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  hint?: string;
}

export default function FileDropzone({ label, accept, file, onChange, hint }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) onChange(dropped);
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="relative cursor-pointer rounded-md border-2 border-dashed border-stone-300 hover:border-green-500 bg-stone-50 hover:bg-green-50 transition-colors px-4 py-3"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <p className="text-xs font-medium text-stone-600">{label}</p>
      {file ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-xs text-green-700 font-mono truncate">{file.name}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); if (inputRef.current) inputRef.current.value = ""; }}
            className="text-xs text-stone-400 hover:text-red-500 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ) : (
        <p className="mt-0.5 text-xs text-stone-400">
          {hint ?? `Drop ${accept} here or click to browse`}
        </p>
      )}
    </div>
  );
}
