"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseResult } from "@/lib/types";

interface MoleculeViewerProps {
  complexUrl: string;
  poses?: PoseResult[];
}

function applyStyles(viewer: any, hasNative: boolean) {
  viewer.setStyle({}, {});
  viewer.setStyle(
    { hetflag: false },
    { cartoon: { color: "spectrum", opacity: 0.65 } }
  );
  viewer.setStyle(
    { within: { distance: 5, sel: { resn: "LIG" } } },
    {
      cartoon: { color: "spectrum", opacity: 0.65 },
      stick: { colorscheme: "whiteCarbon", radius: 0.12, opacity: 0.9 },
    }
  );
  viewer.setStyle(
    { resn: "LIG" },
    {
      stick: { colorscheme: "greenCarbon", radius: 0.18 },
      sphere: { colorscheme: "greenCarbon", scale: 0.22 },
    }
  );
  if (hasNative) {
    viewer.setStyle(
      { resn: "NAT" },
      {
        stick: { colorscheme: "orangeCarbon", radius: 0.15 },
        sphere: { colorscheme: "orangeCarbon", scale: 0.18 },
      }
    );
  }
}

export default function MoleculeViewer({ complexUrl, poses }: MoleculeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const hasNativeRef = useRef(false);
  const [selectedPose, setSelectedPose] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize viewer + load all poses as frames
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

        const isMultiModel = pdbText.includes("\nMODEL") || pdbText.startsWith("MODEL");
        if (isMultiModel) {
          viewer.addModelsAsFrames(pdbText, "pdb");
        } else {
          viewer.addModel(pdbText, "pdb");
        }

        const hasNative = pdbText.includes("NAT X");
        hasNativeRef.current = hasNative;

        applyStyles(viewer, hasNative);
        viewer.zoomTo(hasNative ? { resn: ["LIG", "NAT"] } : { resn: "LIG" });
        viewer.render();

        viewerRef.current = viewer;
        setLoading(false);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [complexUrl]);

  // Switch frame on pose selection
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !poses || poses.length <= 1) return;
    v.setFrame(selectedPose);
    applyStyles(v, hasNativeRef.current);
    v.render();
  }, [selectedPose, poses]);

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
        3D viewer failed: {error}
      </div>
    );
  }

  const hasPoses = poses && poses.length > 1;

  return (
    <div className="rounded-md overflow-hidden border border-stone-200">
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-50 z-10">
            <span className="text-xs text-stone-400">Loading 3D structure…</span>
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height: "400px" }} />
      </div>

      {hasPoses && (
        <div className="border-t border-stone-100 bg-stone-50 p-3">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">
            Docked Poses — click to switch
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {poses.map((pose, i) => {
              const isSelected = selectedPose === i;
              const rmsdOk = pose.rmsd_A != null && pose.rmsd_A < 2.0;
              const rmsdBad = pose.rmsd_A != null && pose.rmsd_A >= 2.0;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedPose(i)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? "border-green-500 bg-green-50 text-green-800 shadow-sm"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <div className="font-semibold mb-1 flex items-center gap-1">
                    Pose {pose.rank}
                    {i === 0 && (
                      <span className="text-[9px] bg-green-200 text-green-800 px-1 py-0.5 rounded leading-none">
                        best
                      </span>
                    )}
                  </div>
                  <div className="text-stone-500">
                    ΔG {pose.delta_g.toFixed(1)}
                  </div>
                  <div className="text-stone-500">
                    pIC50 {pose.pic50.toFixed(2)}
                  </div>
                  {pose.rmsd_A != null && (
                    <div className={`font-medium ${rmsdOk ? "text-green-600" : rmsdBad ? "text-amber-600" : ""}`}>
                      RMSD {pose.rmsd_A.toFixed(1)} Å
                    </div>
                  )}
                  {pose.pocket_distance_A != null && pose.rmsd_A == null && (
                    <div className="text-stone-400">
                      dist {pose.pocket_distance_A.toFixed(1)} Å
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-stone-400 mt-2">
            Green = docked pose · Orange = crystal native · RMSD vs crystal ligand
          </p>
        </div>
      )}
    </div>
  );
}
