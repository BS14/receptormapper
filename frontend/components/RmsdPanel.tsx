"use client";

import type { RmsdResult } from "@/lib/types";

const T = {
  cardBg:   "#EFEFEB",
  border:   "#D8D8D2",
  ink:      "#2c2218",
  inkMuted: "#6b5c48",
  inkFaint: "#a89880",
  teal:     "#8BDFDD",
  tealDark: "#5bbfbd",
  yellow:   "#FFE394",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="flex items-start justify-between gap-4 py-1.5"
      style={{ borderBottom: `1px solid ${T.border}` }}
    >
      <span
        className="text-xs font-semibold uppercase tracking-widest shrink-0 w-36"
        style={{ color: T.inkFaint }}
      >
        {label}
      </span>
      <span className="text-sm text-right" style={{ color: T.inkMuted }}>{value}</span>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
      style={
        ok
          ? { backgroundColor: "#8BDFDD28", color: "#5bbfbd" }
          : { backgroundColor: "#FFE39450", color: "#6b5c48" }
      }
    >
      {label}
    </span>
  );
}

export default function RmsdPanel({ rmsd }: { rmsd: RmsdResult }) {
  if (!rmsd.available) return null;

  const isSelfDock = rmsd.mode === "self_docking";
  const pocketOk   = rmsd.pocket_distance_A != null && rmsd.pocket_distance_A < 4.0;

  return (
    <div
      className="rounded-md px-5 py-4 space-y-1"
      style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: T.inkMuted }}>
          RMSD Validation
        </p>
        <span className="text-xs italic" style={{ color: T.inkFaint }}>
          Schrödinger Glide-style pose assessment
        </span>
      </div>

      <Row
        label="Native ligand"
        value={
          <span>
            <span className="font-mono font-semibold" style={{ color: T.ink }}>{rmsd.native_resname}</span>
            {rmsd.native_heavy_count != null && (
              <span className="ml-1" style={{ color: T.inkFaint }}>· {rmsd.native_heavy_count} heavy atoms</span>
            )}
          </span>
        }
      />

      <Row
        label="Mode"
        value={
          <span className="flex items-center gap-2 justify-end">
            {isSelfDock
              ? <Badge ok label="Self-docking" />
              : <Badge ok={false} label="Cross-docking" />
            }
            {rmsd.tanimoto != null && (
              <span className="text-xs" style={{ color: T.inkFaint }}>
                Tanimoto {rmsd.tanimoto.toFixed(2)}
              </span>
            )}
          </span>
        }
      />

      {rmsd.pocket_distance_A != null && (
        <Row
          label="Pocket distance"
          value={
            <span className="flex items-center gap-2 justify-end">
              <span className="font-mono" style={{ color: T.ink }}>{rmsd.pocket_distance_A.toFixed(2)} Å</span>
              <Badge ok={pocketOk} label={pocketOk ? "Same pocket" : "Different pocket"} />
            </span>
          }
        />
      )}

      {isSelfDock && (
        <Row
          label="Ligand RMSD"
          value={
            rmsd.ligand_rmsd_A != null ? (
              <span className="flex items-center gap-2 justify-end">
                <span className="font-mono" style={{ color: T.ink }}>{rmsd.ligand_rmsd_A.toFixed(2)} Å</span>
                <Badge
                  ok={rmsd.success === true}
                  label={rmsd.success === true ? "< 2.0 Å — pose matches crystal" : "> 2.0 Å — pose diverges"}
                />
              </span>
            ) : (
              <span style={{ color: T.inkFaint }}>— atom count mismatch</span>
            )
          }
        />
      )}

      {!isSelfDock && (
        <Row
          label="Ligand RMSD"
          value={<span style={{ color: T.inkFaint }}>— different ligand (N/A)</span>}
        />
      )}

      <p className="text-xs pt-1" style={{ color: T.inkFaint }}>
        Orange = crystal native ligand &nbsp;·&nbsp; Green = docked pose
      </p>
    </div>
  );
}
