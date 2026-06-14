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
        <p className="text-sm text-coral-dark bg-coral/10 border border-coral/30 rounded px-4 py-3">
          {error}
        </p>
        <button onClick={() => router.push("/")} className="text-sm text-teal-dark hover:underline">
          ← Back to submission
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="max-w-xl mx-auto mt-24 text-center space-y-3">
        <div className="flex justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-teal border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-ink-muted capitalize">{status}…</p>
        <p className="text-xs text-ink-faint">
          Running AutoDock Vina — typically 30–120 s
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold text-ink"
            style={{ fontFamily: "var(--font-audiowide)" }}
          >
            Docking Results
          </h1>
          {meta?.job_name && (
            <p className="text-sm text-ink-muted mt-0.5">{meta.job_name}</p>
          )}
          <p className="text-xs text-ink-faint font-mono mt-0.5">job {meta?.job_id ?? jobId}</p>
        </div>
        <div className="no-print flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-white hover:bg-cream-dark border border-cream-dark text-sm text-ink-muted transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save PDF
          </button>
          <button onClick={() => router.push("/")} className="text-sm text-teal-dark hover:underline">
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
              className={`flex gap-3 items-start rounded-md px-4 py-3 text-sm border ${
                f.level === "danger"
                  ? "bg-coral/10 border-coral/30 text-coral-dark"
                  : f.level === "warning"
                  ? "bg-yellow/30 border-yellow text-ink-muted"
                  : "bg-teal/10 border-teal/30 text-teal-dark"
              }`}
            >
              <span className="font-semibold uppercase text-xs shrink-0 mt-0.5">{f.level}</span>
              <span>{f.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Job ID ── */}
      <div className="flex items-center gap-2 text-xs text-ink-faint">
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

      {result.binding.docked_complex_url ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">
              Docked Complex
            </h2>
            <a
              href={result.binding.docked_complex_url}
              download="complex.pdb"
              className="text-xs text-teal-dark hover:text-teal underline"
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
        <div className="rounded-md bg-cream-dark/30 border border-cream-dark px-4 py-6 text-center text-xs text-ink-faint">
          3D viewer unavailable — S3 bucket not configured or upload failed.
        </div>
      )}

      {/* ── Citations ── */}
      <div className="border-t border-cream-dark pt-6 space-y-2">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-widest">References</p>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-ink-faint leading-relaxed">
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
