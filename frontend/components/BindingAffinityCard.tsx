import type { BindingResult, NativeDocking } from "@/lib/types";

// ── Shared design tokens ──────────────────────────────────────────────────────
const T = {
  cardBg:    "#EFEFEB",
  border:    "#D8D8D2",
  ink:       "#2c2218",
  inkMuted:  "#6b5c48",
  inkFaint:  "#a89880",
  teal:      "#8BDFDD",
  tealDark:  "#5bbfbd",
  coral:     "#F48F68",
  coralDark: "#d96a44",
  yellow:    "#FFE394",
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide" style={{ color: T.inkFaint }}>{label}</p>
      <p className="text-lg font-semibold" style={{ color: T.ink }}>
        {value}
        {sub && <span className="text-xs ml-1" style={{ color: T.inkFaint }}>{sub}</span>}
      </p>
    </div>
  );
}

function formatIC50(nM: number) {
  return nM >= 1000
    ? { value: (nM / 1000).toFixed(2), unit: "µM" }
    : { value: nM.toFixed(1), unit: "nM" };
}

const STRENGTH_COLOR: Record<string, string> = {
  strong:   T.tealDark,
  moderate: T.coral,
  weak:     T.inkFaint,
};

const SELECTIVITY_STYLE: Record<string, React.CSSProperties> = {
  stronger: { backgroundColor: "#8BDFDD28", color: "#5bbfbd" },
  similar:  { backgroundColor: "#FFE39450", color: "#6b5c48" },
  weaker:   { backgroundColor: "#D8D8D2",   color: "#a89880" },
};

const SELECTIVITY_LABEL: Record<string, string> = {
  stronger: "Stronger than native",
  similar:  "Similar to native",
  weaker:   "Weaker than native",
};

function ComparisonTable({ user, native }: { user: BindingResult; native: NativeDocking }) {
  const userIC50 = formatIC50(user.ic50_nM);
  const natIC50  = formatIC50(native.ic50_nM);

  return (
    <div className="pt-4 space-y-2" style={{ borderTop: `1px solid ${T.border}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: T.inkFaint }}>
        vs Native Ligand
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide" style={{ color: T.inkFaint }}>
            <th className="text-left font-medium pb-1 w-28" />
            <th className="text-right font-medium pb-1">Your compound</th>
            <th className="text-right font-medium pb-1">Native ligand</th>
          </tr>
        </thead>
        <tbody style={{ borderTop: `1px solid ${T.border}` }}>
          {[
            {
              label: "pIC50",
              user: user.pIC50.toFixed(2),
              native: native.pIC50.toFixed(2),
            },
          ].map((row) => (
            <tr key={row.label} style={{ borderBottom: `1px solid ${T.border}` }}>
              <td className="py-1.5" style={{ color: T.inkMuted }}>{row.label}</td>
              <td className="py-1.5 text-right font-semibold" style={{ color: T.ink }}>{row.user}</td>
              <td className="py-1.5 text-right" style={{ color: T.inkMuted }}>{row.native}</td>
            </tr>
          ))}
          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
            <td className="py-1.5" style={{ color: T.inkMuted }}>IC50</td>
            <td className="py-1.5 text-right font-semibold" style={{ color: T.ink }}>
              {userIC50.value} <span className="text-xs" style={{ color: T.inkFaint }}>{userIC50.unit}</span>
            </td>
            <td className="py-1.5 text-right" style={{ color: T.inkMuted }}>
              {natIC50.value} <span className="text-xs" style={{ color: T.inkFaint }}>{natIC50.unit}</span>
            </td>
          </tr>
          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
            <td className="py-1.5" style={{ color: T.inkMuted }}>ΔG</td>
            <td className="py-1.5 text-right font-semibold" style={{ color: T.ink }}>
              {user.delta_g.toFixed(1)} <span className="text-xs" style={{ color: T.inkFaint }}>kcal/mol</span>
            </td>
            <td className="py-1.5 text-right" style={{ color: T.inkMuted }}>
              {native.delta_g.toFixed(1)} <span className="text-xs" style={{ color: T.inkFaint }}>kcal/mol</span>
            </td>
          </tr>
          <tr>
            <td className="py-1.5" style={{ color: T.inkMuted }}>ΔΔG</td>
            <td className="py-1.5 text-right" colSpan={2}>
              <span className="font-mono mr-2" style={{ color: T.inkMuted }}>
                {native.delta_delta_g > 0 ? "+" : ""}{native.delta_delta_g.toFixed(2)} kcal/mol
              </span>
              <span
                className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
                style={SELECTIVITY_STYLE[native.selectivity]}
              >
                {SELECTIVITY_LABEL[native.selectivity]}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs" style={{ color: T.inkFaint }}>
        ΔΔG = your ΔG − native ΔG · negative = stronger predicted binding than native
      </p>
    </div>
  );
}

export default function BindingAffinityCard({ binding }: { binding: BindingResult }) {
  const confidencePct = Math.round(binding.confidence * 100);

  return (
    <div
      className="rounded-lg p-5 space-y-4 shadow-sm"
      style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: T.inkMuted }}>
          Binding Affinity — AutoDock Vina
        </h2>
        <span
          className="text-sm font-bold capitalize"
          style={{ color: STRENGTH_COLOR[binding.strength] ?? T.inkFaint }}
        >
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

      {/* ── Confidence bar ── */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs" style={{ color: T.inkFaint }}>
          <span>Docking confidence</span>
          <span>{confidencePct}%</span>
        </div>
        <div className="h-1.5 rounded-full" style={{ backgroundColor: T.border }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${confidencePct}%`, backgroundColor: T.teal }}
          />
        </div>
        <p className="text-xs mt-1" style={{ color: T.inkFaint }}>
          Confidence derived from ΔG magnitude — physics-based estimate only.
        </p>
      </div>

      {binding.native_docking && (
        <ComparisonTable user={binding} native={binding.native_docking} />
      )}
    </div>
  );
}
