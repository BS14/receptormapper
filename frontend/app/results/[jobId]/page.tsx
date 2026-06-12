"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BindingAffinityCard from "@/components/BindingAffinityCard";
import OffTargetTable from "@/components/OffTargetTable";
import CellLineSensitivityGrid from "@/components/CellLineSensitivityGrid";
import ADMETPanel from "@/components/ADMETPanel";
import SubmissionInfoCard from "@/components/SubmissionInfoCard";
import MoleculeViewer from "@/components/MoleculeViewer";
import type { PredictionResult, SubmissionMeta } from "@/lib/types";

const POLL_INTERVAL_MS = 2000;

const PUBCHEM = (smiles: string) =>
  `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/` +
  `${encodeURIComponent(smiles)}/property/Title,IUPACName/JSON`;

export default function ResultsPage({ params }: { params: { jobId: string } }) {
  const { jobId } = params;
  const router = useRouter();
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [meta, setMeta] = useState<SubmissionMeta | null>(null);
  const [status, setStatus] = useState<string>("queued");
  const [error, setError] = useState<string | null>(null);
  const [compoundName, setCompoundName] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false); // kept for type compat, unused
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch compound name once meta is available
  useEffect(() => {
    if (!meta?.smiles) return;
    fetch(PUBCHEM(meta.smiles))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCompoundName(d?.PropertyTable?.Properties?.[0]?.Title ?? null))
      .catch(() => {});
  }, [meta?.smiles]);

  useEffect(() => {
    if (jobId === "cache") {
      const raw = sessionStorage.getItem("result_cache");
      if (raw) {
        const { result, meta } = JSON.parse(raw);
        setResult(result);
        setMeta(meta);
        setStatus("complete");
      } else {
        router.push("/");
      }
      return;
    }

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
            setError(data.error ?? "Prediction failed");
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
  }, [jobId, router]);

  function handleDownloadPDF() {
    window.print();
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center space-y-4">
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-4 py-3">{error}</p>
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
        <p className="text-xs text-stone-400">Polling every 2 s</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Prediction Results</h1>
          {jobId !== "cache" && (
            <p className="text-xs text-stone-500 font-mono mt-0.5">job {jobId}</p>
          )}
        </div>
        <div className="no-print flex items-center gap-3">
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-white hover:bg-stone-50 border border-stone-300 text-sm text-stone-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save PDF
          </button>
          <button onClick={() => router.push("/")} className="text-sm text-green-700 hover:underline">
            ← New prediction
          </button>
        </div>
      </div>

      {meta && <SubmissionInfoCard meta={meta} />}

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BindingAffinityCard binding={result.binding} tanimoto={result.tanimoto} />
        <ADMETPanel admet={result.admet} />
      </div>

      {result.binding.docked_complex_url && (
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
      )}

      <OffTargetTable entries={result.offtarget} />
      <CellLineSensitivityGrid entries={result.cellline} />

      {/* Citations */}
      <div className="border-t border-stone-200 pt-6 space-y-2">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest">References</p>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-stone-500 leading-relaxed">
          <li>
            Huang, K., Fu, T., Glass, L. M., Zitnik, M., Xiao, C., &amp; Sun, J. (2020).{" "}
            <span className="italic">DeepPurpose: A Deep Learning Library for Drug-Target Interaction Prediction.</span>{" "}
            Bioinformatics.
          </li>
          {meta?.model?.startsWith("TDC_") && (
            <>
              <li>
                Huang, K., Fu, T., Gao, W., Zhao, Y., Roohani, Y., Leskovec, J., Coley, C. W., Xiao, C., Sun, J., &amp; Zitnik, M. (2021).{" "}
                <span className="italic">Therapeutics Data Commons: Machine Learning Datasets and Tasks for Drug Discovery and Development.</span>{" "}
                NeurIPS Datasets and Benchmarks.
              </li>
              <li>
                Huang, K., Fu, T., Gao, W., Zhao, Y., Roohani, Y., Leskovec, J., Coley, C. W., Xiao, C., Sun, J., &amp; Zitnik, M. (2022).{" "}
                <span className="italic">Artificial intelligence foundation for therapeutic science.</span>{" "}
                Nature Chemical Biology.
              </li>
            </>
          )}
        </ol>
      </div>
    </div>
  );
}
