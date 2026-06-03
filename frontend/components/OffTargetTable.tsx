import type { OffTargetEntry } from "@/lib/types";

interface Props {
  entries: OffTargetEntry[];
}

const RISK_BADGE: Record<string, string> = {
  high: "bg-red-950 text-red-400 border border-red-800",
  medium: "bg-yellow-950 text-yellow-400 border border-yellow-800",
  low: "bg-gray-800 text-gray-400 border border-gray-700",
  unknown: "bg-gray-800 text-gray-500 border border-gray-700",
};

export default function OffTargetTable({ entries }: Props) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Off-Target Panel ({entries.length} proteins)
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
              <th className="text-left px-5 py-2">Protein</th>
              <th className="text-left px-5 py-2">Family</th>
              <th className="text-right px-5 py-2">pIC50</th>
              <th className="text-center px-5 py-2">Risk</th>
              <th className="text-center px-5 py-2">Flag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {entries.map((e) => (
              <tr key={e.name} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-5 py-2 font-medium text-gray-200">{e.name}</td>
                <td className="px-5 py-2 text-gray-500">{e.family}</td>
                <td className="px-5 py-2 text-right font-mono text-gray-300">
                  {e.pic50.toFixed(2)}
                </td>
                <td className="px-5 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_BADGE[e.risk]}`}>
                    {e.risk}
                  </span>
                </td>
                <td className="px-5 py-2 text-center">
                  {e.flag && <span className="text-red-400 text-xs font-bold">⚠</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
