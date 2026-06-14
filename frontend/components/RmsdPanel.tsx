"use client";

import type { RmsdResult } from "@/lib/types";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-cream-dark last:border-0">
      <span className="text-xs font-semibold text-ink-faint uppercase tracking-widest shrink-0 w-36">
        {label}
      </span>
      <span className="text-sm text-ink-muted text-right">{value}</span>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
        ok
          ? "bg-teal/20 text-teal-dark"
          : "bg-yellow/40 text-ink-muted"
      }`}
    >
      {label}
    </span>
  );
}

export default function RmsdPanel({ rmsd }: { rmsd: RmsdResult }) {
  if (!rmsd.available) return null;

  const isSelfDock  = rmsd.mode === "self_docking";
  const pocketOk    = rmsd.pocket_distance_A != null && rmsd.pocket_distance_A < 4.0;

  return (
    <div className="rounded-md border border-cream-dark bg-white px-5 py-4 space-y-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-widest">
          RMSD Validation
        </p>
        <span className="text-xs text-ink-faint italic">
          Schrödinger Glide-style pose assessment
        </span>
      </div>

      <Row
        label="Native ligand"
        value={
          <span>
            <span className="font-mono font-semibold">{rmsd.native_resname}</span>
            {rmsd.native_heavy_count != null && (
              <span className="text-ink-faint ml-1">· {rmsd.native_heavy_count} heavy atoms</span>
            )}
          </span>
        }
      />

      <Row
        label="Mode"
        value={
          <span className="flex items-center gap-2 justify-end">
            {isSelfDock ? (
              <Badge ok label="Self-docking" />
            ) : (
              <Badge ok={false} label="Cross-docking" />
            )}
            {rmsd.tanimoto != null && (
              <span className="text-ink-faint text-xs">
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
              <span className="font-mono">{rmsd.pocket_distance_A.toFixed(2)} Å</span>
              <Badge
                ok={pocketOk}
                label={pocketOk ? "Same pocket" : "Different pocket"}
              />
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
                <span className="font-mono">{rmsd.ligand_rmsd_A.toFixed(2)} Å</span>
                <Badge
                  ok={rmsd.success === true}
                  label={
                    rmsd.success === true
                      ? "< 2.0 Å — pose matches crystal"
                      : "> 2.0 Å — pose diverges"
                  }
                />
              </span>
            ) : (
              <span className="text-ink-faint">— atom count mismatch</span>
            )
          }
        />
      )}

      {!isSelfDock && (
        <Row
          label="Ligand RMSD"
          value={<span className="text-ink-faint">— different ligand (N/A)</span>}
        />
      )}

      <p className="text-xs text-ink-faint pt-1">
        Orange = crystal native ligand &nbsp;·&nbsp; Green = docked pose
      </p>
    </div>
  );
}
