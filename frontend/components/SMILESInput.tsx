"use client";

import { useEffect, useRef, useState } from "react";

interface CompoundInfo {
  name: string | null;
  iupac: string | null;
}

const PUBCHEM = (smiles: string) =>
  `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/` +
  `${encodeURIComponent(smiles)}/property/Title,IUPACName/JSON`;

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function SMILESInput({ value, onChange }: Props) {
  const [info, setInfo] = useState<CompoundInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value || value.length < 3) {
      setInfo(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(PUBCHEM(value));
        if (!res.ok) { setInfo({ name: null, iupac: null }); return; }
        const data = await res.json();
        const props = data?.PropertyTable?.Properties?.[0];
        setInfo({ name: props?.Title ?? null, iupac: props?.IUPACName ?? null });
      } catch {
        setInfo({ name: null, iupac: null });
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  return (
    <div className="space-y-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="CC(=O)Nc1ccc(O)cc1"
        spellCheck={false}
        className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 font-mono placeholder-gray-600 focus:outline-none focus:border-indigo-500"
      />

      {/* Name badge row */}
      <div className="h-5 flex items-center gap-2">
        {loading && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full border border-gray-500 border-t-transparent animate-spin" />
            Looking up…
          </span>
        )}

        {!loading && info?.name && (
          <span className="text-xs font-semibold text-indigo-300 bg-indigo-950 border border-indigo-800 rounded px-2 py-0.5">
            {info.name}
          </span>
        )}

        {!loading && info?.iupac && (
          <span className="text-xs text-gray-500 truncate max-w-xs" title={info.iupac}>
            {info.iupac.length > 55 ? info.iupac.slice(0, 55) + "…" : info.iupac}
          </span>
        )}

        {!loading && info && !info.name && !info.iupac && value.length >= 3 && (
          <span className="text-xs text-gray-600">Not in PubChem</span>
        )}
      </div>
    </div>
  );
}
