"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FileDropzone from "@/components/FileDropzone";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  pageBg:    "#F8F8F5",
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
  navy:      "rgb(0, 48, 73)",
};

const VALIDATED_PAIRS = [
  { pdb: "1IEP", compound: "Imatinib",     cid: "5291",    target: "ABL1 kinase",       expIC50: "25 nM",    note: "Official Vina benchmark" },
  { pdb: "2ITY", compound: "Erlotinib",    cid: "176870",  target: "EGFR kinase",       expIC50: "2 nM",     note: "Kinase inhibitor" },
  { pdb: "1HSG", compound: "Indinavir",    cid: "5362440", target: "HIV-1 protease",    expIC50: "0.34 nM",  note: "Official Vina tutorial" },
  { pdb: "4DJV", compound: "Lapatinib",    cid: "208908",  target: "HER2/EGFR",         expIC50: "10 nM",    note: "Kinase inhibitor" },
  { pdb: "2CJI", compound: "Oseltamivir",  cid: "65028",   target: "Flu neuraminidase", expIC50: "1 nM",     note: "Antiviral" },
  { pdb: "1DKF", compound: "Methotrexate", cid: "126941",  target: "DHFR",              expIC50: "1 pM",     note: "Antifolate" },
] as const;

const LIMITATIONS = [
  { label: "Nuclear hormone receptors",    examples: "ER, AR, MR, GR, PR",  reason: "Require flexible receptor — Vina rigid underestimates by 2–3 kcal/mol" },
  { label: "Metalloprotease active sites", examples: "MMP, ADAM, ACE",       reason: "Zn²⁺/Fe coordination ignored by Vina scoring function" },
  { label: "GPCRs",                        examples: "β2-AR, D2, CXCR4",     reason: "Transmembrane binding pocket poorly sampled by rigid docking" },
  { label: "Very large ligands",           examples: "MW > 600 Da",           reason: "Too many rotatable bonds → exhaustiveness 16 insufficient" },
  { label: "Apo structures",              examples: "No HETATM in PDB",      reason: "Falls back to fpocket — box center may not match binding site" },
];

function timeAgo(unixSecs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface RecentJob {
  job_id: string;
  job_name: string;
  created_at: number;
}

export default function HomePage() {
  const router = useRouter();

  const [receptorFile, setReceptorFile] = useState<File | null>(null);
  const [ligandFile, setLigandFile]     = useState<File | null>(null);
  const [pdbId, setPdbId]               = useState("");
  const [fetchingReceptor, setFetchingReceptor] = useState(false);
  const [compoundQuery, setCompoundQuery]       = useState("");
  const [fetchingLigand, setFetchingLigand]     = useState(false);
  const [jobName, setJobName]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((d) => setRecentJobs(d.jobs ?? []))
      .catch(() => {});
  }, []);

  async function fetchFromRCSB() {
    const id = pdbId.trim().toUpperCase();
    if (!id) return;
    setFetchingReceptor(true);
    setError(null);
    try {
      const res = await fetch(`https://files.rcsb.org/download/${id}.pdb`);
      if (!res.ok) throw new Error(`PDB entry "${id}" not found on RCSB`);
      const blob = await res.blob();
      setReceptorFile(new File([blob], `${id}.pdb`, { type: "chemical/x-pdb" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFetchingReceptor(false);
    }
  }

  async function fetchFromPubChem() {
    const q = compoundQuery.trim();
    if (!q) return;
    setFetchingLigand(true);
    setError(null);
    try {
      const isNumeric = /^\d+$/.test(q);
      const endpoint = isNumeric
        ? `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${q}/SDF`
        : `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/SDF`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Compound "${q}" not found on PubChem`);
      const blob = await res.blob();
      setLigandFile(new File([blob], `${q.replace(/\s+/g, "_")}.sdf`, { type: "chemical/x-mdl-sdfile" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFetchingLigand(false);
    }
  }

  async function loadPair(pdb: string, compound: string) {
    setPdbId(pdb);
    setCompoundQuery(compound);
    setReceptorFile(null);
    setLigandFile(null);
    setError(null);
    const [receptorRes, ligandRes] = await Promise.allSettled([
      fetch(`https://files.rcsb.org/download/${pdb}.pdb`),
      fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(compound)}/SDF`),
    ]);
    if (receptorRes.status === "fulfilled" && receptorRes.value.ok) {
      const blob = await receptorRes.value.blob();
      setReceptorFile(new File([blob], `${pdb}.pdb`, { type: "chemical/x-pdb" }));
    }
    if (ligandRes.status === "fulfilled" && ligandRes.value.ok) {
      const blob = await ligandRes.value.blob();
      setLigandFile(new File([blob], `${compound.replace(/\s+/g, "_")}.sdf`, { type: "chemical/x-mdl-sdfile" }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receptorFile || !ligandFile) return;
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("receptor_pdb", receptorFile);
      fd.append("ligand_file", ligandFile);
      if (jobName) fd.append("job_name", jobName);
      const res = await fetch("/api/predict", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.detail ?? data.error ?? "Submission failed"); return; }
      router.push(`/results/${data.job_id}`);
    } catch {
      setError("Network error — is the API server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Submission form (2 columns) ── */}
        <div className="lg:col-span-2 space-y-8">

          {/* Page title */}
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-audiowide)", color: T.ink }}
            >
              Molecular Docking
            </h1>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: T.inkMuted }}>
              Upload a receptor PDB and ligand SDF/mol2 file to run AutoDock Vina
              and visualise the docked complex in 3D.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Receptor */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold" style={{ color: T.ink }}>
                Receptor (PDB)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pdbId}
                  onChange={(e) => setPdbId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), fetchFromRCSB())}
                  placeholder="PDB ID — e.g. 1IEP, 2HYY, 1EQG"
                  className="flex-1 rounded-md border px-3 py-2 text-sm font-mono focus:outline-none"
                  style={{ backgroundColor: T.cardBg, borderColor: T.border, color: T.ink }}
                />
                <button
                  type="button"
                  onClick={fetchFromRCSB}
                  disabled={!pdbId.trim() || fetchingReceptor}
                  className="px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-85"
                  style={{ backgroundColor: T.teal, color: T.ink }}
                >
                  {fetchingReceptor ? "Fetching…" : "Fetch RCSB"}
                </button>
              </div>
              <p className="text-xs -mt-1" style={{ color: T.inkFaint }}>Or upload a PDB file directly:</p>
              <FileDropzone
                label="Receptor PDB"
                accept=".pdb"
                file={receptorFile}
                onChange={setReceptorFile}
                hint="Drop .pdb here or click to browse"
              />
            </div>

            {/* Ligand */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold" style={{ color: T.ink }}>
                Ligand (SDF / mol2)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={compoundQuery}
                  onChange={(e) => setCompoundQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), fetchFromPubChem())}
                  placeholder="Compound name or CID — e.g. Imatinib, 5291, Erlotinib"
                  className="flex-1 rounded-md border px-3 py-2 text-sm font-mono focus:outline-none"
                  style={{ backgroundColor: T.cardBg, borderColor: T.border, color: T.ink }}
                />
                <button
                  type="button"
                  onClick={fetchFromPubChem}
                  disabled={!compoundQuery.trim() || fetchingLigand}
                  className="px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-85"
                  style={{ backgroundColor: T.coral, color: "#ffffff" }}
                >
                  {fetchingLigand ? "Fetching…" : "Fetch PubChem"}
                </button>
              </div>
              <p className="text-xs -mt-1" style={{ color: T.inkFaint }}>Or upload an SDF / mol2 file directly:</p>
              <FileDropzone
                label="Ligand (SDF / mol2)"
                accept=".sdf,.mol2"
                file={ligandFile}
                onChange={setLigandFile}
                hint="Drop .sdf or .mol2 here or click to browse"
              />
            </div>

            {/* Job name */}
            <div className="space-y-1">
              <label className="block text-sm font-medium" style={{ color: T.ink }}>
                Job name <span className="font-normal" style={{ color: T.inkFaint }}>(optional)</span>
              </label>
              <input
                type="text"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="e.g. Imatinib / ABL1 screen"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
                style={{ backgroundColor: T.cardBg, borderColor: T.border, color: T.ink }}
              />
            </div>

            {/* Error */}
            {error && (
              <p
                className="text-sm rounded px-3 py-2"
                style={{ color: T.coralDark, backgroundColor: "#F48F6815", border: `1px solid #F48F6840` }}
              >
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !receptorFile || !ligandFile}
              className="w-full py-2.5 rounded-md text-sm font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-85"
              style={{ backgroundColor: T.coral, color: "#ffffff" }}
            >
              {loading ? "Submitting…" : "Run Docking"}
            </button>
          </form>

          {/* System limitations */}
          <div className="pt-6 space-y-2" style={{ borderTop: `1px solid ${T.border}` }}>
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: T.ink }}
            >
              System Limitations
            </p>
            <p className="text-xs leading-relaxed" style={{ color: T.inkMuted }}>
              Uses rigid receptor (AutoDock Vina). Results for flexible binding sites may underestimate affinity by 2–3 kcal/mol.
            </p>
            <div className="space-y-1.5">
              {LIMITATIONS.map((lim) => (
                <div
                  key={lim.label}
                  className="rounded px-2.5 py-2"
                  style={{ backgroundColor: "#FFE39430", border: `1px solid #FFE39480` }}
                >
                  <p className="text-xs font-semibold" style={{ color: T.ink }}>{lim.label}</p>
                  <p className="text-xs italic" style={{ color: T.inkMuted }}>{lim.examples}</p>
                  <p className="text-xs leading-relaxed mt-0.5" style={{ color: T.inkFaint }}>{lim.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-3">
          <h2
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: T.ink }}
          >
            Recent Docking Jobs
          </h2>

          {recentJobs.length === 0 ? (
            <p className="text-xs" style={{ color: T.inkFaint }}>
              No jobs yet. Results appear here after completion.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentJobs.map((job) => (
                <li key={job.job_id}>
                  <button
                    onClick={() => router.push(`/results/${job.job_id}`)}
                    className="w-full text-left rounded-md border px-3 py-2.5 transition-opacity hover:opacity-80"
                    style={{ backgroundColor: T.cardBg, borderColor: T.border }}
                  >
                    <p className="text-sm font-medium truncate" style={{ color: T.ink }}>
                      {job.job_name || job.job_id.slice(0, 8)}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: T.inkFaint }}>
                      {timeAgo(job.created_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs" style={{ color: T.inkFaint }}>Results cached for 24 hours.</p>

          {/* Quick links */}
          <div className="pt-4 space-y-2" style={{ borderTop: `1px solid ${T.border}` }}>
            <p
              className="text-xs font-medium uppercase tracking-widest"
              style={{ color: T.inkMuted }}
            >
              Quick links
            </p>
            <a
              href="https://www.rcsb.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#8BDFDD22", borderColor: "#8BDFDD88" }}
            >
              <span className="text-xs font-semibold" style={{ color: T.tealDark }}>RCSB Protein Data Bank</span>
              <span className="text-xs" style={{ color: T.tealDark }}>↗</span>
            </a>
            <a
              href="https://pubchem.ncbi.nlm.nih.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#F48F6820", borderColor: "#F48F6870" }}
            >
              <span className="text-xs font-semibold" style={{ color: T.coralDark }}>PubChem Compound Database</span>
              <span className="text-xs" style={{ color: T.coralDark }}>↗</span>
            </a>
          </div>

          {/* Validated test pairs */}
          <div className="pt-4 space-y-2" style={{ borderTop: `1px solid ${T.border}` }}>
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: T.ink }}
              >
                Validated Test Pairs
              </p>
              <p className="text-xs mt-0.5" style={{ color: T.inkFaint }}>Click to auto-fill and fetch</p>
            </div>
            {VALIDATED_PAIRS.map((pair) => (
              <button
                key={pair.pdb}
                type="button"
                onClick={() => loadPair(pair.pdb, pair.compound)}
                className="w-full text-left rounded-md border px-2.5 py-2 transition-opacity hover:opacity-80"
                style={{ backgroundColor: T.cardBg, borderColor: T.border }}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-mono font-bold" style={{ color: T.ink }}>
                    {pair.pdb}
                  </span>
                  <span className="text-xs" style={{ color: T.inkFaint }}>IC50 {pair.expIC50}</span>
                </div>
                <div className="text-xs truncate" style={{ color: T.inkMuted }}>
                  {pair.compound} · {pair.target}
                </div>
                <div className="text-xs mt-0.5" style={{ color: T.tealDark }}>{pair.note}</div>
              </button>
            ))}
            <p className="text-xs leading-relaxed" style={{ color: T.inkFaint }}>
              Expected ΔG: −5 to −7 weak · −7 to −9 moderate · −9 to −12 strong · below −12 suspicious
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
