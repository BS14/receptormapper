"use client";

import { useEffect, useState } from "react";
import MoleculeDrawing from "./MoleculeDrawing";
import type { SubmissionMeta } from "@/lib/types";

const PANEL_LABELS: Record<string, string> = {
  lung: "Lung (12 lines)",
  breast: "Breast (10 lines)",
  colorectal: "Colorectal (12 lines)",
  prostate: "Prostate (10 lines)",
  ovarian: "Ovarian (10 lines)",
  pancreatic: "Pancreatic (10 lines)",
  leukemia: "Leukemia / Hematological (12 lines)",
  melanoma: "Melanoma (10 lines)",
  glioblastoma: "Glioblastoma / Brain (10 lines)",
  liver: "Liver / HCC (10 lines)",
  renal: "Renal / Kidney (10 lines)",
  pan: "Pan-cancer (20 lines)",
  diabetic: "Diabetic / Metabolic (10 lines)",
  neurological: "Neurological (10 lines)",
};

const MODEL_LABELS: Record<string, string> = {
  MPNN_CNN_BindingDB_IC50: "MPNN-CNN · BindingDB IC50",
};

const PUBCHEM = (smiles: string) =>
  `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/` +
  `${encodeURIComponent(smiles)}/property/Title,IUPACName/JSON`;

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function ExpandableTarget({ sequence }: { sequence: string }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW = 60;

  if (sequence.length <= PREVIEW) {
    return <span className="text-xs font-mono text-gray-200 break-all">{sequence}</span>;
  }

  return (
    <div className="space-y-1">
      <span className="text-xs font-mono text-gray-200 break-all">
        {expanded ? sequence : sequence.slice(0, PREVIEW) + "…"}
      </span>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        {expanded
          ? "▲ collapse"
          : `▼ show all ${sequence.length} AA`}
      </button>
    </div>
  );
}

export default function SubmissionInfoCard({ meta }: { meta: SubmissionMeta }) {
  const [compoundName, setCompoundName] = useState<string | null>(null);
  const [iupacName, setIupacName] = useState<string | null>(null);
  const [nameLoading, setNameLoading] = useState(true);

  // Direct browser fetch — PubChem supports CORS
  useEffect(() => {
    fetch(PUBCHEM(meta.smiles))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const props = d?.PropertyTable?.Properties?.[0];
        setCompoundName(props?.Title ?? null);
        setIupacName(props?.IUPACName ?? null);
      })
      .catch(() => {})
      .finally(() => setNameLoading(false));
  }, [meta.smiles]);

  const rows = [
    {
      label: "Compound",
      content: nameLoading ? (
        <span className="text-xs text-gray-500 italic">looking up…</span>
      ) : compoundName ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-indigo-300">{compoundName}</span>
          {iupacName && (
            <span className="text-xs text-gray-500" title={iupacName}>
              {truncate(iupacName, 46)}
            </span>
          )}
        </div>
      ) : iupacName ? (
        <span className="text-xs text-gray-300" title={iupacName}>
          {truncate(iupacName, 60)}
        </span>
      ) : (
        <span className="text-xs text-gray-600 italic">Not in PubChem</span>
      ),
    },
    {
      label: "SMILES",
      content: (
        <span className="text-xs font-mono text-gray-200 break-all" title={meta.smiles}>
          {truncate(meta.smiles, 52)}
        </span>
      ),
    },
    {
      label: "Target",
      content: <ExpandableTarget sequence={meta.target} />,
    },
    {
      label: "Model",
      content: (
        <span className="text-xs text-gray-200">
          {MODEL_LABELS[meta.model] ?? meta.model}
        </span>
      ),
    },
    {
      label: "Cell Panel",
      content: (
        <span className="text-xs text-gray-200">
          {PANEL_LABELS[meta.cell_panel] ?? meta.cell_panel}
        </span>
      ),
    },
  ];

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
        Submission
      </h2>

      <div className="flex gap-6 items-start">
        {/* Info table */}
        <div className="flex-1 min-w-0">
          <table className="w-full">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-gray-800 last:border-0">
                  <td className="py-2.5 pr-4 align-top w-24 shrink-0">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {row.label}
                    </span>
                  </td>
                  <td className="py-2.5 align-top">{row.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 2D structure */}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <MoleculeDrawing smiles={meta.smiles} width={210} height={170} />
          <span className="text-xs text-gray-600">2D structure</span>
        </div>
      </div>
    </div>
  );
}
