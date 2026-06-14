"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BindingAffinityCard from "@/components/BindingAffinityCard";
import MoleculeViewer from "@/components/MoleculeViewer";
import ReceptorInfoPanel from "@/components/ReceptorInfoPanel";
import LigandInfoPanel from "@/components/LigandInfoPanel";
import RmsdPanel from "@/components/RmsdPanel";
import type { PredictionResult, JobMeta } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;

// ── Shared design tokens ──────────────────────────────────────────────────────
const T = {
  pageBg:    "#F8F8F5",
  cardBg:    "#EFEFEB",
  border:    "#D8D8D2",
  ink:       "#2c2218",
  inkMuted:  "#6b5c48",
  inkFaint:  "#a89880",
  teal:      "#8BDFDD",
  tealDark:  "#5bbfbd",
  coral:     "#F48F68",
  coralDark: "#d96a44",
  yellow:    "#FFE394",
  navy:      "rgb(0, 48, 73)",
};

export default function ResultsPage({ params }: { params: { jobId: string } }) {
  const { jobId } = params;
  const router = useRouter();
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [meta, setMeta] = useState<JobMeta | null>(null);
  const [status, setStatus] = useState<string>("queued");
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function poll() {
      fetch(`/api/predict/${jobId}`)
        .then((r) => r.json())
        .then((data) => {
          setStatus(data.status);
          if (data.status === "complete") {
            setResult(data.result);
            setMeta(data.meta ?? null);
            clearInterval(intervalRef.current!);
          } else if (data.status === "failed") {
            setError(data.error ?? "Docking failed");
            clearInterval(intervalRef.current!);
          }
        })
        .catch(() => {
          setError("Failed to poll job status");
          clearInterval(intervalRef.current!);
        });
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalRef.current!);
  }, [jobId]);

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center space-y-4">
        <p
          className="text-sm rounded px-4 py-3"
          style={{ color: T.coralDark, backgroundColor: "#F48F6818", border: `1px solid #F48F6840` }}
        >
          {error}
        </p>
        <button
          onClick={() => router.push("/")}
          className="text-sm hover:underline"
          style={{ color: T.tealDark }}
        >
          Back to submission
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="max-w-xl mx-auto mt-24 text-center space-y-3">
        <div className="flex justify-center">
          <div
            className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: T.teal, borderTopColor: "transparent" }}
          />
        </div>
        <p className="text-sm capitalize" style={{ color: T.inkMuted }}>{status}…</p>
        <p className="text-xs" style={{ color: T.inkFaint }}>
          Running AutoDock Vina — typically 30–120 s
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-xl font-bold"
            style={{ fontFamily: "var(--font-audiowide)", color: T.ink }}
          >
            Docking Results
          </h1>
          {meta?.job_name && (
            <p className="text-sm mt-0.5" style={{ color: T.inkMuted }}>{meta.job_name}</p>
          )}
          <p className="text-xs font-mono mt-0.5" style={{ color: T.inkFaint }}>
            job {meta?.job_id ?? jobId}
          </p>
        </div>
        <div className="no-print flex items-center gap-3 shrink-0">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors"
            style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}`, color: T.inkMuted }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save PDF
          </button>
          <button
            onClick={() => router.push("/")}
            className="text-sm hover:underline"
            style={{ color: T.tealDark }}
          >
            ← New job
          </button>
        </div>
      </div>

      {/* ── Flags ── */}
      {result.flags.length > 0 && (
        <div className="space-y-2">
          {result.flags.map((f, i) => (
            <div
              key={i}
              className="flex gap-3 items-start rounded-md px-4 py-3 text-sm"
              style={
                f.level === "danger"
                  ? { backgroundColor: "#F48F6818", border: `1px solid #F48F6840`, color: T.coralDark }
                  : f.level === "warning"
                  ? { backgroundColor: "#FFE39440", border: `1px solid ${T.yellow}`, color: T.inkMuted }
                  : { backgroundColor: "#8BDFDD18", border: `1px solid #8BDFDD40`, color: T.tealDark }
              }
            >
              <span className="font-semibold uppercase text-xs shrink-0 mt-0.5">{f.level}</span>
              <span>{f.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Job ID chip ── */}
      <div className="flex items-center gap-2 text-xs" style={{ color: T.inkFaint }}>
        <span className="font-semibold uppercase tracking-widest">Job ID</span>
        <span className="font-mono">{meta?.job_id ?? jobId}</span>
      </div>

      {result.inputs?.receptor_name && (
        <ReceptorInfoPanel receptorName={result.inputs.receptor_name} />
      )}

      {result.inputs?.smiles && (
        <LigandInfoPanel
          smiles={result.inputs.smiles}
          ligandName={result.inputs.ligand_name}
        />
      )}

      {result.binding.rmsd?.available && (
        <RmsdPanel rmsd={result.binding.rmsd} />
      )}

      <BindingAffinityCard binding={result.binding} />

      {/* ── 3D viewer ── */}
      {result.binding.docked_complex_url ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2
              className="text-sm font-semibold uppercase tracking-widest"
              style={{ color: T.ink }}
            >
              Docked Complex
            </h2>
            <a
              href={result.binding.docked_complex_url}
              download="complex.pdb"
              className="text-xs underline transition-colors"
              style={{ color: T.tealDark }}
            >
              Download PDB
            </a>
          </div>
          <MoleculeViewer
            complexUrl={result.binding.docked_complex_url}
            poses={result.binding.poses}
          />
        </div>
      ) : (
        <div
          className="rounded-md px-4 py-6 text-center text-xs"
          style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}`, color: T.inkFaint }}
        >
          3D viewer unavailable — S3 bucket not configured or upload failed.
        </div>
      )}

      {/* ── Citations ── */}
      <div className="pt-6 space-y-2" style={{ borderTop: `1px solid ${T.border}` }}>
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: T.inkMuted }}
        >
          References
        </p>
        <ol
          className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed"
          style={{ color: T.inkFaint }}
        >
          <li>
            Eberhardt, J., Santos-Martins, D., Tillack, A. F., &amp; Forli, S. (2021).{" "}
            <span className="italic">AutoDock Vina 1.2.0: New Docking Methods, Expanded Force Field, and Python Bindings.</span>{" "}
            Journal of Chemical Information and Modeling, 61(8), 3891–3898.
          </li>
          <li>
            Trott, O., &amp; Olson, A. J. (2010).{" "}
            <span className="italic">AutoDock Vina: improving the speed and accuracy of docking with a new scoring function, efficient optimization, and multithreading.</span>{" "}
            Journal of Computational Chemistry, 31(2), 455–461.
          </li>
          <li>
            Kim, S., Chen, J., Cheng, T., et al. (2023).{" "}
            <span className="italic">PubChem 2023 update.</span>{" "}
            Nucleic Acids Research, 51(D1), D1373–D1380.
          </li>
        </ol>
      </div>
    </div>
  );
}
