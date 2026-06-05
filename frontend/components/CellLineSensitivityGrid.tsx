"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CellLineEntry } from "@/lib/types";

interface Props {
  entries: CellLineEntry[];
}

export default function CellLineSensitivityGrid({ entries }: Props) {
  const data = entries.map((e) => ({ name: e.name, ic50: e.ic50 }));
  const maxIc50 = Math.max(...data.map((d) => d.ic50));

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">
          Cell Line Sensitivity
        </h2>
        <span className="text-xs text-stone-500">IC50 (µM) — lower = more sensitive</span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: "#57534e", fontSize: 11 }}
            angle={-40}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fill: "#57534e", fontSize: 11 }}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={{ background: "#ffffff", border: "1px solid #d6d3d1", borderRadius: 6 }}
            labelStyle={{ color: "#292524" }}
            formatter={(v: number) => [`${v.toFixed(3)} µM`, "IC50"]}
          />
          <Bar dataKey="ic50" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.ic50 < 1 ? "#16a34a" : entry.ic50 < 10 ? "#4ade80" : "#a8a29e"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex gap-4 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-600 inline-block" /> &lt;1 µM (sensitive)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> 1–10 µM
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-stone-400 inline-block" /> &gt;10 µM (resistant)
        </span>
      </div>
    </div>
  );
}
