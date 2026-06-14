"use client";

import { useEffect, useState } from "react";

interface PubChemData {
  cid: number;
  iupacName: string;
  preferredName: string;
  molecularFormula: string;
  molecularWeight: number;
  isomericSmiles: string;
  inchiKey: string;
  xLogP: number | null;
  tpsa: number | null;
  hbondDonors: number | null;
  hbondAcceptors: number | null;
  rotatableBonds: number | null;
  exactMass: number | null;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-sm text-ink-muted">{value}</p>
    </div>
  );
}

export default function LigandInfoPanel({
  smiles,
  ligandName,
}: {
  smiles: string;
  ligandName?: string;
}) {
  const [data, setData] = useState<PubChemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!smiles) { setLoading(false); return; }

    const encoded = encodeURIComponent(smiles);
    const props = [
      "MolecularFormula", "MolecularWeight", "IUPACName", "IsomericSMILES",
      "InChIKey", "XLogP", "TPSA", "HBondDonorCount", "HBondAcceptorCount",
      "RotatableBondCount", "ExactMass",
    ].join(",");

    Promise.all([
      fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encoded}/property/${props}/JSON`
      ).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encoded}/synonyms/JSON`
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([propData, synData]) => {
        const p = propData.PropertyTable?.Properties?.[0];
        if (!p) { setNotFound(true); setLoading(false); return; }
        const synonyms: string[] = synData?.InformationList?.Information?.[0]?.Synonym ?? [];
        const preferred =
          synonyms.find((s: string) => /^[A-Z][a-z]/.test(s)) ??
          synonyms[0] ??
          ligandName ??
          "";
        setData({
          cid: p.CID,
          iupacName: p.IUPACName ?? "",
          preferredName: preferred,
          molecularFormula: p.MolecularFormula ?? "",
          molecularWeight: p.MolecularWeight ?? 0,
          isomericSmiles: p.IsomericSMILES ?? smiles,
          inchiKey: p.InChIKey ?? "",
          xLogP: p.XLogP ?? null,
          tpsa: p.TPSA ?? null,
          hbondDonors: p.HBondDonorCount ?? null,
          hbondAcceptors: p.HBondAcceptorCount ?? null,
          rotatableBonds: p.RotatableBondCount ?? null,
          exactMass: p.ExactMass ?? null,
        });
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [smiles]);

  return (
    <div className="rounded-md border border-cream-dark bg-white px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-widest">Ligand</p>
        <div className="flex items-center gap-3">
          {data?.cid && (
            <a
              href={`https://pubchem.ncbi.nlm.nih.gov/compound/${data.cid}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-coral/15 hover:bg-coral/30 border border-coral/30 text-coral-dark transition-colors"
            >
              PubChem ↗
            </a>
          )}
          {(data || notFound) && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-ink-faint hover:text-ink-muted"
            >
              {expanded ? "Show less ↑" : "Show more ↓"}
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-xs text-ink-faint">Loading PubChem data…</p>}

      {notFound && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            <InfoRow label="Name" value={ligandName ?? "—"} />
            <p className="text-xs text-ink-faint col-span-3 self-end">Not found in PubChem</p>
          </div>
          {expanded && (
            <div className="border-t border-cream-dark pt-3">
              <InfoRow
                label="SMILES"
                value={<span className="font-mono text-xs break-all">{smiles}</span>}
              />
            </div>
          )}
        </>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            {data.preferredName && <InfoRow label="Name" value={data.preferredName} />}
            <InfoRow label="PubChem CID" value={data.cid} />
            {data.molecularFormula && <InfoRow label="Formula" value={data.molecularFormula} />}
            {data.molecularWeight != null && (
              <InfoRow label="MW" value={`${data.molecularWeight} g/mol`} />
            )}
          </div>

          {expanded && (
            <div className="border-t border-cream-dark pt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              {data.exactMass != null && (
                <InfoRow label="Exact Mass" value={`${data.exactMass} Da`} />
              )}
              {data.xLogP != null && <InfoRow label="XLogP" value={data.xLogP} />}
              {data.tpsa != null && <InfoRow label="TPSA" value={`${data.tpsa} Å²`} />}
              {data.hbondDonors != null && <InfoRow label="HBD" value={data.hbondDonors} />}
              {data.hbondAcceptors != null && <InfoRow label="HBA" value={data.hbondAcceptors} />}
              {data.rotatableBonds != null && (
                <InfoRow label="Rotatable Bonds" value={data.rotatableBonds} />
              )}
              {data.iupacName && (
                <div className="col-span-2 sm:col-span-3">
                  <InfoRow label="IUPAC Name" value={data.iupacName} />
                </div>
              )}
              <div className="col-span-2 sm:col-span-3">
                <InfoRow
                  label="Isomeric SMILES"
                  value={<span className="font-mono text-xs break-all">{data.isomericSmiles}</span>}
                />
              </div>
              {data.inchiKey && (
                <div className="col-span-2 sm:col-span-3">
                  <InfoRow
                    label="InChIKey"
                    value={<span className="font-mono text-xs">{data.inchiKey}</span>}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
