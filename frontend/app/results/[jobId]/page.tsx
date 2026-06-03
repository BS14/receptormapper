"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BindingAffinityCard from "@/components/BindingAffinityCard";
import OffTargetTable from "@/components/OffTargetTable";
import CellLineSensitivityGrid from "@/components/CellLineSensitivityGrid";
import ADMETPanel from "@/components/ADMETPanel";
import SubmissionInfoCard from "@/components/SubmissionInfoCard";
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
  const [pdfLoading, setPdfLoading] = useState(false);
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

  async function handleDownloadPDF() {
    if (!result || !meta) return;
    setPdfLoading(true);
    try {
      // Grab the molecule canvas data URL if rendered
      const canvas = document.querySelector<HTMLCanvasElement>("canvas");
      const molDataUrl = canvas ? canvas.toDataURL("image/png") : null;

      const { generatePDF } = await import("@/lib/generatePDF");
      await generatePDF(meta, result, compoundName, molDataUrl);
    } catch (e) {
      console.error("PDF generation failed", e);
    } finally {
      setPdfLoading(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center space-y-4">
        <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded px-4 py-3">{error}</p>
        <button onClick={() => router.push("/")} className="text-sm text-indigo-400 hover:underline">
          ← Back to submission
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="max-w-xl mx-auto mt-24 text-center space-y-3">
        <div className="flex justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-gray-400 capitalize">{status}…</p>
        <p className="text-xs text-gray-600">Polling every 2 s</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Prediction Results</h1>
          {jobId !== "cache" && (
            <p className="text-xs text-gray-500 font-mono mt-0.5">job {jobId}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pdfLoading ? (
              <>
                <span className="inline-block w-4 h-4 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Download PDF
              </>
            )}
          </button>
          <button onClick={() => router.push("/")} className="text-sm text-indigo-400 hover:underline">
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
                  ? "bg-red-950 border-red-800 text-red-300"
                  : f.level === "warning"
                  ? "bg-yellow-950 border-yellow-800 text-yellow-300"
                  : "bg-blue-950 border-blue-800 text-blue-300"
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

      <OffTargetTable entries={result.offtarget} />
      <CellLineSensitivityGrid entries={result.cellline} />
    </div>
  );
}
