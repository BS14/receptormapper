import type { OffTargetEntry } from "@/lib/types";

interface Props {
  entries: OffTargetEntry[];
}

const RISK_BADGE: Record<string, string> = {
  high: "bg-red-50 text-red-700 border border-red-200",
  medium: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  low: "bg-stone-100 text-stone-600 border border-stone-200",
  unknown: "bg-stone-100 text-stone-500 border border-stone-200",
};

export default function OffTargetTable({ entries }: Props) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-stone-200 bg-stone-50">
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">
          Off-Target Panel ({entries.length} proteins)
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-stone-500 uppercase tracking-wide border-b border-stone-200 bg-stone-50">
              <th className="text-left px-5 py-2">Protein</th>
              <th className="text-left px-5 py-2">Family</th>
              <th className="text-right px-5 py-2">pIC50</th>
              <th className="text-center px-5 py-2">Risk</th>
              <th className="text-center px-5 py-2">Flag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {entries.map((e) => (
              <tr key={e.name} className="hover:bg-stone-50 transition-colors">
                <td className="px-5 py-2 font-medium text-stone-800">{e.name}</td>
                <td className="px-5 py-2 text-stone-500">{e.family}</td>
                <td className="px-5 py-2 text-right font-mono text-stone-700">
                  {e.pic50.toFixed(2)}
                </td>
                <td className="px-5 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_BADGE[e.risk]}`}>
                    {e.risk}
                  </span>
                </td>
                <td className="px-5 py-2 text-center">
                  {e.flag && <span className="text-red-600 text-xs font-bold">⚠</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
