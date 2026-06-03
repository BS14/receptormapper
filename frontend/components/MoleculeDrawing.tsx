"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  smiles: string;
  width?: number;
  height?: number;
}

export default function MoleculeDrawing({ smiles, width = 220, height = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!smiles || !canvasRef.current) return;
    let cancelled = false;

    // smiles-drawer v1.0.x ships compiled JS only — no TypeScript source issues
    import("smiles-drawer").then((mod) => {
      if (cancelled || !canvasRef.current) return;

      const SD = (mod.default ?? mod) as any;

      try {
        const drawer = new SD.Drawer({
          width,
          height,
          bondThickness: 1.0,
          shortBondWidth: 0.85,
          fontSizeLarge: 11,
          fontSizeSmall: 8,
          themes: {
            dark: {
              C: "#e5e7eb",
              O: "#f87171",
              N: "#93c5fd",
              F: "#6ee7b7",
              CL: "#6ee7b7",
              BR: "#fdba74",
              S: "#fde68a",
              P: "#fdba74",
              I: "#c4b5fd",
              H: "#6b7280",
              BACKGROUND: "#030712",
            },
          },
        });

        SD.parse(
          smiles,
          (tree: unknown) => {
            if (cancelled || !canvasRef.current) return;
            try {
              drawer.draw(tree, canvasRef.current, "dark", false);
            } catch {
              if (!cancelled) setError(true);
            }
          },
          () => { if (!cancelled) setError(true); }
        );
      } catch {
        if (!cancelled) setError(true);
      }
    }).catch(() => { if (!cancelled) setError(true); });

    return () => { cancelled = true; };
  }, [smiles, width, height]);

  if (error) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-xs text-gray-600 rounded border border-gray-800 bg-gray-950"
      >
        structure unavailable
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded border border-gray-800"
      style={{ background: "#030712" }}
    />
  );
}
