"use client";

import { useEffect, useRef, useState } from "react";

interface MoleculeViewerProps {
  complexUrl: string;
}

export default function MoleculeViewer({ complexUrl }: MoleculeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !complexUrl) return;

    let cancelled = false;

    (async () => {
      try {
        const [{ default: $3Dmol }, pdbText] = await Promise.all([
          import("3dmol"),
          fetch(complexUrl).then((r) => {
            if (!r.ok) throw new Error(`Failed to fetch PDB: ${r.status}`);
            return r.text();
          }),
        ]);

        if (cancelled || !containerRef.current) return;

        const viewer = ($3Dmol as any).createViewer(containerRef.current, {
          backgroundColor: "0xffffff",
        });

        viewer.addModel(pdbText, "pdb");

        // Receptor chains — cartoon, spectrum coloring
        viewer.setStyle(
          { atom: "CA" },
          { cartoon: { color: "spectrum", opacity: 0.85 } }
        );

        // Ligand (last chain / HETATM) — thick sticks, green carbon
        viewer.setStyle(
          { hetflag: true },
          { stick: { colorscheme: "greenCarbon", radius: 0.2 } }
        );

        viewer.zoomTo();
        viewer.render();
        setLoading(false);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [complexUrl]);

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
        3D viewer failed: {error}
      </div>
    );
  }

  return (
    <div className="relative rounded-md overflow-hidden border border-stone-200">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-50 z-10">
          <span className="text-xs text-stone-400">Loading 3D structure…</span>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: "400px" }} />
    </div>
  );
}
