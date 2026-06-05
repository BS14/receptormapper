import type { BindingResult, TanimotoResult } from "@/lib/types";

interface Props {
  binding: BindingResult;
  tanimoto: TanimotoResult;
}

const STRENGTH_COLOR: Record<string, string> = {
  strong: "text-green-600",
  moderate: "text-yellow-600",
  weak: "text-stone-400",
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-stone-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-stone-800">
        {value}
        {sub && <span className="text-xs text-stone-500 ml-1">{sub}</span>}
      </p>
    </div>
  );
}

export default function BindingAffinityCard({ binding, tanimoto }: Props) {
  const confidencePct = Math.round(binding.confidence * 100);

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">
          Binding Affinity
        </h2>
        <span className={`text-sm font-bold capitalize ${STRENGTH_COLOR[binding.strength] ?? "text-stone-400"}`}>
          {binding.strength}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="pIC50" value={binding.pIC50.toFixed(2)} />
        <Stat label="IC50" value={binding.ic50_nM >= 1000
          ? `${(binding.ic50_nM / 1000).toFixed(2)}`
          : binding.ic50_nM.toFixed(1)}
          sub={binding.ic50_nM >= 1000 ? "µM" : "nM"}
        />
        <Stat label="ΔG" value={binding.delta_g.toFixed(1)} sub="kcal/mol" />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-stone-500">
          <span>Confidence</span>
          <span>{confidencePct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        {tanimoto.extrapolation_risk && (
          <p className="text-xs text-yellow-600 mt-1">
            Low training similarity ({tanimoto.max_tanimoto.toFixed(2)}) — extrapolation
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-200 text-xs text-stone-500">
        <span>Max Tanimoto: <span className="text-stone-700">{tanimoto.max_tanimoto.toFixed(3)}</span></span>
        <span>Top-10 mean: <span className="text-stone-700">{tanimoto.mean_top10.toFixed(3)}</span></span>
      </div>
    </div>
  );
}
