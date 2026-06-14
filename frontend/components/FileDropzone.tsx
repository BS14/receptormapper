"use client";

import { useRef, useState } from "react";

interface FileDropzoneProps {
  label: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  hint?: string;
}

export default function FileDropzone({ label, accept, file, onChange, hint }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onChange(dropped);
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-md border-2 border-dashed transition-all px-4 py-3 ${
        dragging
          ? "border-coral bg-coral/10 scale-[1.01] shadow-md"
          : "border-cream-dark hover:border-teal bg-cream/60 hover:bg-teal/5"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      {file ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-xs text-teal-dark font-mono truncate">{file.name}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); if (inputRef.current) inputRef.current.value = ""; }}
            className="text-xs text-ink-faint hover:text-coral-dark flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ) : (
        <p className={`mt-0.5 text-xs font-medium transition-colors ${dragging ? "text-coral-dark" : "text-ink-faint"}`}>
          {dragging ? "Release to upload" : (hint ?? `Drop ${accept} here or click to browse`)}
        </p>
      )}
    </div>
  );
}
