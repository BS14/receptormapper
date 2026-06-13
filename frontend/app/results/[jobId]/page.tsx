"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BindingAffinityCard from "@/components/BindingAffinityCard";
import MoleculeViewer from "@/components/MoleculeViewer";
import ReceptorInfoPanel from "@/components/ReceptorInfoPanel";
import LigandInfoPanel from "@/components/LigandInfoPanel";
import type { PredictionResult, JobMeta } from "@/lib/types";

const POLL_INTERVAL_MS = 2000;

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
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-4 py-3">
          {error}
        </p>
        <button onClick={() => router.push("/")} className="text-sm text-green-700 hover:underline">
          ← Back to submission
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="max-w-xl mx-auto mt-24 text-center space-y-3">
        <div className="flex justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-green-600 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-stone-500 capitalize">{status}…</p>
        <p className="text-xs text-stone-400">
          Running AutoDock Vina — typically 30–120 s
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Docking Results</h1>
          {meta?.job_name && (
            <p className="text-sm text-stone-500 mt-0.5">{meta.job_name}</p>
          )}
          <p className="text-xs text-stone-400 font-mono mt-0.5">job {meta?.job_id ?? jobId}</p>
        </div>
        <div className="no-print flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-white hover:bg-stone-50 border border-stone-300 text-sm text-stone-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save PDF
          </button>
          <button onClick={() => router.push("/")} className="text-sm text-green-700 hover:underline">
            ← New job
          </button>
        </div>
      </div>

      {/* Flags */}
      {result.flags.length > 0 && (
        <div className="space-y-2">
          {result.flags.map((f, i) => (
            <div
              key={i}
              className={`flex gap-3 items-start rounded-md px-4 py-3 text-sm border ${
                f.level === "danger"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : f.level === "warning"
                  ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                  : "bg-blue-50 border-blue-200 text-blue-700"
              }`}
            >
              <span className="font-semibold uppercase text-xs shrink-0 mt-0.5">{f.level}</span>
              <span>{f.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Job ID */}
      <div className="flex items-center gap-2 text-xs text-stone-400">
        <span className="font-semibold uppercase tracking-widest">Job ID</span>
        <span className="font-mono">{meta?.job_id ?? jobId}</span>
      </div>

      {/* Receptor info — fetches RCSB live */}
      {result.inputs?.receptor_name && (
        <ReceptorInfoPanel receptorName={result.inputs.receptor_name} />
      )}

      {/* Ligand info — fetches PubChem live */}
      {result.inputs?.smiles && (
        <LigandInfoPanel
          smiles={result.inputs.smiles}
          ligandName={result.inputs.ligand_name}
        />
      )}

      {/* Binding affinity card */}
      <BindingAffinityCard binding={result.binding} />

      {/* 3D complex viewer */}
      {result.binding.docked_complex_url ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-widest">
              Docked Complex
            </h2>
            <a
              href={result.binding.docked_complex_url}
              download="complex.pdb"
              className="text-xs text-green-700 hover:text-green-600 underline"
            >
              Download PDB
            </a>
          </div>
          <MoleculeViewer complexUrl={result.binding.docked_complex_url} />
        </div>
      ) : (
        <div className="rounded-md bg-stone-50 border border-stone-200 px-4 py-6 text-center text-xs text-stone-400">
          3D viewer unavailable — S3 bucket not configured or upload failed.
        </div>
      )}

      {/* Citations */}
      <div className="border-t border-stone-200 pt-6 space-y-2">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest">References</p>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-stone-500 leading-relaxed">
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
