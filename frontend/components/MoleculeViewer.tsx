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
        const [$3Dmol, pdbText] = await Promise.all([
          import("3dmol"),
          fetch(complexUrl).then((r) => {
            if (!r.ok) throw new Error(`Failed to fetch PDB: ${r.status}`);
            return r.text();
          }),
        ]);

        if (cancelled || !containerRef.current) return;

        const viewer = ($3Dmol as any).createViewer(containerRef.current, {
          backgroundColor: "white",
        });

        viewer.addModel(pdbText, "pdb");

        // Receptor: semi-transparent cartoon
        viewer.setStyle(
          { hetflag: false },
          { cartoon: { color: "spectrum", opacity: 0.65 } }
        );

        // Binding pocket: residues within 5 Å of ligand as sticks
        viewer.setStyle(
          { within: { distance: 5, sel: { resn: "LIG" } } },
          {
            cartoon: { color: "spectrum", opacity: 0.65 },
            stick: { colorscheme: "whiteCarbon", radius: 0.12, opacity: 0.9 },
          }
        );

        // Ligand (HETATM LIG): green sticks + small spheres for visibility
        viewer.setStyle(
          { resn: "LIG" },
          {
            stick: { colorscheme: "greenCarbon", radius: 0.18 },
            sphere: { colorscheme: "greenCarbon", scale: 0.22 },
          }
        );

        // Zoom into the ligand so binding pose is front-and-centre
        viewer.zoomTo({ resn: "LIG" });
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
