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
      className="relative cursor-pointer rounded-md border-2 border-dashed transition-all px-4 py-3"
      style={dragging
        ? { borderColor: "#F48F68", backgroundColor: "#F48F6818", transform: "scale(1.01)", boxShadow: "0 4px 12px #F48F6830" }
        : { borderColor: "#d8d8d2", backgroundColor: "#eeeee9" }
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <p className="text-xs font-medium" style={{ color: "#6b5c48" }}>{label}</p>
      {file ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-xs font-mono truncate" style={{ color: "#5bbfbd" }}>{file.name}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); if (inputRef.current) inputRef.current.value = ""; }}
            className="text-xs flex-shrink-0 transition-colors"
            style={{ color: "#a89880" }}
          >
            ✕
          </button>
        </div>
      ) : (
        <p className="mt-0.5 text-xs font-medium transition-colors" style={{ color: dragging ? "#d96a44" : "#a89880" }}>
          {dragging ? "Release to upload" : (hint ?? `Drop ${accept} here or click to browse`)}
        </p>
      )}
    </div>
  );
}
