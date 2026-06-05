import type { AdmetResult } from "@/lib/types";

interface Props {
  admet: AdmetResult;
}

interface Rule {
  label: string;
  value: string | number;
  limit: string;
  pass: boolean;
}

export default function ADMETPanel({ admet }: Props) {
  const rules: Rule[] = [
    { label: "MW", value: `${admet.mw.toFixed(1)} Da`, limit: "≤500 Da", pass: admet.mw <= 500 },
    { label: "LogP", value: admet.logP.toFixed(2), limit: "≤5", pass: admet.logP <= 5 },
    { label: "HBD", value: admet.hbd, limit: "≤5", pass: admet.hbd <= 5 },
    { label: "HBA", value: admet.hba, limit: "≤10", pass: admet.hba <= 10 },
    { label: "TPSA", value: `${admet.tpsa.toFixed(1)} Å²`, limit: "≤140 Å²", pass: admet.tpsa <= 140 },
    { label: "RotBonds", value: admet.rotatable_bonds, limit: "≤10", pass: admet.rotatable_bonds <= 10 },
  ];

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">
          ADMET / Lipinski Ro5
        </h2>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded ${
            admet.drug_like
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {admet.drug_like ? "Drug-like" : "Non drug-like"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {rules.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between rounded bg-stone-50 px-3 py-2 text-sm border border-stone-100"
          >
            <div>
              <span className="text-stone-500 mr-2">{r.label}</span>
              <span className="text-stone-800 font-mono">{r.value}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className={`text-xs font-bold ${r.pass ? "text-green-600" : "text-red-600"}`}>
                {r.pass ? "✓" : "✗"}
              </span>
              <span className="text-xs text-stone-400">{r.limit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm pt-1 border-t border-stone-200">
        <span className="text-stone-500">Ro5 violations:</span>
        <span
          className={`font-semibold ${
            admet.ro5_violations === 0
              ? "text-green-600"
              : admet.ro5_violations === 1
              ? "text-yellow-600"
              : "text-red-600"
          }`}
        >
          {admet.ro5_violations}
        </span>
        <span className="text-stone-500 ml-auto">
          Aromatic rings: <span className="text-stone-700">{admet.aromatic_rings}</span>
        </span>
      </div>
    </div>
  );
}
