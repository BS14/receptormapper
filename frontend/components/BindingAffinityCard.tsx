import type { BindingResult, NativeDocking } from "@/lib/types";

interface Props {
  binding: BindingResult;
}

const STRENGTH_COLOR: Record<string, string> = {
  strong: "text-green-600",
  moderate: "text-yellow-600",
  weak: "text-stone-400",
};

const SELECTIVITY_STYLE: Record<string, string> = {
  stronger: "bg-green-100 text-green-700",
  similar: "bg-yellow-100 text-yellow-700",
  weaker: "bg-stone-100 text-stone-500",
};

const SELECTIVITY_LABEL: Record<string, string> = {
  stronger: "Stronger than native",
  similar: "Similar to native",
  weaker: "Weaker than native",
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

function formatIC50(nM: number) {
  return nM >= 1000
    ? { value: (nM / 1000).toFixed(2), unit: "µM" }
    : { value: nM.toFixed(1), unit: "nM" };
}

function ComparisonTable({ user, native }: { user: BindingResult; native: NativeDocking }) {
  const userIC50 = formatIC50(user.ic50_nM);
  const natIC50 = formatIC50(native.ic50_nM);

  return (
    <div className="border-t border-stone-100 pt-4 space-y-2">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest">
        vs Native Ligand
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-stone-400 uppercase tracking-wide">
            <th className="text-left font-medium pb-1 w-28"></th>
            <th className="text-right font-medium pb-1">Your compound</th>
            <th className="text-right font-medium pb-1">Native ligand</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          <tr>
            <td className="py-1.5 text-stone-500">pIC50</td>
            <td className="py-1.5 text-right font-semibold text-stone-800">{user.pIC50.toFixed(2)}</td>
            <td className="py-1.5 text-right text-stone-600">{native.pIC50.toFixed(2)}</td>
          </tr>
          <tr>
            <td className="py-1.5 text-stone-500">IC50</td>
            <td className="py-1.5 text-right font-semibold text-stone-800">
              {userIC50.value} <span className="text-xs text-stone-400">{userIC50.unit}</span>
            </td>
            <td className="py-1.5 text-right text-stone-600">
              {natIC50.value} <span className="text-xs text-stone-400">{natIC50.unit}</span>
            </td>
          </tr>
          <tr>
            <td className="py-1.5 text-stone-500">ΔG</td>
            <td className="py-1.5 text-right font-semibold text-stone-800">
              {user.delta_g.toFixed(1)} <span className="text-xs text-stone-400">kcal/mol</span>
            </td>
            <td className="py-1.5 text-right text-stone-600">
              {native.delta_g.toFixed(1)} <span className="text-xs text-stone-400">kcal/mol</span>
            </td>
          </tr>
          <tr>
            <td className="py-1.5 text-stone-500">ΔΔG</td>
            <td className="py-1.5 text-right" colSpan={2}>
              <span className="font-mono text-stone-700 mr-2">
                {native.delta_delta_g > 0 ? "+" : ""}{native.delta_delta_g.toFixed(2)} kcal/mol
              </span>
              <span
                className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                  SELECTIVITY_STYLE[native.selectivity]
                }`}
              >
                {SELECTIVITY_LABEL[native.selectivity]}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-stone-400">
        ΔΔG = your ΔG − native ΔG · negative = stronger predicted binding than native
      </p>
    </div>
  );
}

export default function BindingAffinityCard({ binding }: Props) {
  const confidencePct = Math.round(binding.confidence * 100);

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">
          Binding Affinity — AutoDock Vina
        </h2>
        <span className={`text-sm font-bold capitalize ${STRENGTH_COLOR[binding.strength] ?? "text-stone-400"}`}>
          {binding.strength}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="pIC50" value={binding.pIC50.toFixed(2)} />
        <Stat
          label="IC50"
          value={binding.ic50_nM >= 1000
            ? `${(binding.ic50_nM / 1000).toFixed(2)}`
            : binding.ic50_nM.toFixed(1)}
          sub={binding.ic50_nM >= 1000 ? "µM" : "nM"}
        />
        <Stat label="ΔG" value={binding.delta_g.toFixed(1)} sub="kcal/mol" />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-stone-500">
          <span>Docking confidence</span>
          <span>{confidencePct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <p className="text-xs text-stone-400 mt-1">
          Confidence derived from ΔG magnitude — physics-based estimate only.
        </p>
      </div>

      {binding.native_docking && (
        <ComparisonTable user={binding} native={binding.native_docking} />
      )}
    </div>
  );
}
