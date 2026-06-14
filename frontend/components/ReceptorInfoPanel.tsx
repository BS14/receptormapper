"use client";

import { useEffect, useState } from "react";

const T = {
  cardBg:   "#EFEFEB",
  border:   "#D8D8D2",
  ink:      "#2c2218",
  inkMuted: "#6b5c48",
  inkFaint: "#a89880",
  teal:     "#8BDFDD",
  tealDark: "#5bbfbd",
};

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
      <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: T.inkFaint }}>
        {label}
      </p>
      <p className="text-sm" style={{ color: T.inkMuted }}>{value}</p>
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
    <div
      className="rounded-md px-5 py-4 space-y-3"
      style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: T.inkMuted }}>
          Receptor
        </p>
        <div className="flex items-center gap-3">
          {pdbId && (
            <a
              href={`https://www.rcsb.org/structure/${pdbId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#8BDFDD28", border: `1px solid #8BDFDD66`, color: T.tealDark }}
            >
              RCSB ↗
            </a>
          )}
          {data && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-xs transition-colors hover:underline"
              style={{ color: T.inkFaint }}
            >
              {expanded ? "Show less ↑" : "Show more ↓"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
        <InfoRow label="PDB ID" value={pdbId ?? receptorName} />
        {loading && (
          <p className="text-xs col-span-3" style={{ color: T.inkFaint }}>Loading RCSB data…</p>
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

      {expanded && data && (
        <div
          className="pt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3"
          style={{ borderTop: `1px solid ${T.border}` }}
        >
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
