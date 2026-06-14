"use client";

import { useEffect, useState } from "react";

interface RcsbData {
  title: string;
  method: string;
  resolution: number | null;
  depositDate: string;
  releaseDate: string;
  atomCount: number | null;
  residueCount: number | null;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-sm text-stone-700">{value}</p>
    </div>
  );
}

export default function ReceptorInfoPanel({ receptorName }: { receptorName: string }) {
  const [data, setData] = useState<RcsbData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const pdbId = /^[A-Za-z0-9]{4}$/.test(receptorName) ? receptorName.toUpperCase() : null;

  useEffect(() => {
    if (!pdbId) return;
    setLoading(true);
    fetch(`https://data.rcsb.org/rest/v1/core/entry/${pdbId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setData({
          title: d.struct?.title ?? "",
          method: d.exptl?.[0]?.method ?? "",
          resolution: d.rcsb_entry_info?.resolution_combined?.[0] ?? null,
          depositDate: d.rcsb_accession_info?.deposit_date?.slice(0, 10) ?? "",
          releaseDate: d.rcsb_accession_info?.release_date?.slice(0, 10) ?? "",
          atomCount: d.rcsb_entry_info?.deposited_atom_count ?? null,
          residueCount: d.rcsb_entry_info?.deposited_polymer_monomer_count ?? null,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pdbId]);

  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-5 py-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest">Receptor</p>
        <div className="flex items-center gap-3">
          {pdbId && (
            <a
              href={`https://www.rcsb.org/structure/${pdbId}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-green-700 hover:underline"
            >
              View on RCSB ↗
            </a>
          )}
          {data && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-stone-400 hover:text-stone-600"
            >
              {expanded ? "Show less ↑" : "Show more ↓"}
            </button>
          )}
        </div>
      </div>

      {/* Summary row — always visible */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
        <InfoRow label="PDB ID" value={pdbId ?? receptorName} />
        {loading && (
          <p className="text-xs text-stone-400 col-span-3">Loading RCSB data…</p>
        )}
        {data && (
          <>
            {data.method && <InfoRow label="Method" value={data.method} />}
            {data.resolution != null && (
              <InfoRow label="Resolution" value={`${data.resolution} Å`} />
            )}
            {data.depositDate && <InfoRow label="Deposit Date" value={data.depositDate} />}
          </>
        )}
      </div>

      {/* Expanded details */}
      {expanded && data && (
        <div className="border-t border-stone-200 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          {data.title && (
            <div className="col-span-2 sm:col-span-3">
              <InfoRow label="Title" value={data.title} />
            </div>
          )}
          {data.releaseDate && <InfoRow label="Release Date" value={data.releaseDate} />}
          {data.residueCount != null && (
            <InfoRow label="Residues" value={data.residueCount.toLocaleString()} />
          )}
          {data.atomCount != null && (
            <InfoRow label="Atoms" value={data.atomCount.toLocaleString()} />
          )}
        </div>
      )}
    </div>
  );
}
