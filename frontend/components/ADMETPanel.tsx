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
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          ADMET / Lipinski Ro5
        </h2>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded ${
            admet.drug_like
              ? "bg-green-950 text-green-400 border border-green-800"
              : "bg-red-950 text-red-400 border border-red-800"
          }`}
        >
          {admet.drug_like ? "Drug-like" : "Non drug-like"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {rules.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between rounded bg-gray-800 px-3 py-2 text-sm"
          >
            <div>
              <span className="text-gray-400 mr-2">{r.label}</span>
              <span className="text-white font-mono">{r.value}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className={`text-xs font-bold ${r.pass ? "text-green-400" : "text-red-400"}`}>
                {r.pass ? "✓" : "✗"}
              </span>
              <span className="text-xs text-gray-600">{r.limit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm pt-1 border-t border-gray-800">
        <span className="text-gray-500">Ro5 violations:</span>
        <span
          className={`font-semibold ${
            admet.ro5_violations === 0
              ? "text-green-400"
              : admet.ro5_violations === 1
              ? "text-yellow-400"
              : "text-red-400"
          }`}
        >
          {admet.ro5_violations}
        </span>
        <span className="text-gray-500 ml-auto">
          Aromatic rings: <span className="text-gray-300">{admet.aromatic_rings}</span>
        </span>
      </div>
    </div>
  );
}
