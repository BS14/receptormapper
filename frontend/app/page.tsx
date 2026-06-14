"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FileDropzone from "@/components/FileDropzone";

const VALIDATED_PAIRS = [
  { pdb: "1IEP", compound: "Imatinib",    cid: "5291",      target: "ABL1 kinase",         expIC50: "25 nM",   note: "Official Vina benchmark" },
  { pdb: "2ITY", compound: "Erlotinib",   cid: "176870",    target: "EGFR kinase",          expIC50: "2 nM",    note: "Kinase inhibitor" },
  { pdb: "1HSG", compound: "Indinavir",   cid: "5362440",   target: "HIV-1 protease",       expIC50: "0.34 nM", note: "Official Vina tutorial" },
  { pdb: "4DJV", compound: "Lapatinib",   cid: "208908",    target: "HER2/EGFR",            expIC50: "10 nM",   note: "Kinase inhibitor" },
  { pdb: "2CJI", compound: "Oseltamivir", cid: "65028",     target: "Flu neuraminidase",    expIC50: "1 nM",    note: "Antiviral" },
  { pdb: "1DKF", compound: "Methotrexate",cid: "126941",    target: "DHFR",                 expIC50: "1 pM",    note: "Antifolate" },
] as const;

const LIMITATIONS = [
  { label: "Nuclear hormone receptors",  examples: "ER, AR, MR, GR, PR",   reason: "Require flexible receptor — Vina rigid underestimates by 2–3 kcal/mol" },
  { label: "Metalloprotease active sites", examples: "MMP, ADAM, ACE",     reason: "Zn²⁺/Fe coordination ignored by Vina scoring function" },
  { label: "GPCRs",                       examples: "β2-AR, D2, CXCR4",    reason: "Transmembrane binding pocket poorly sampled by rigid docking" },
  { label: "Very large ligands",          examples: "MW > 600 Da",          reason: "Too many rotatable bonds → exhaustiveness 16 insufficient" },
  { label: "Apo structures",             examples: "No HETATM in PDB",     reason: "Falls back to fpocket — box center may not match binding site" },
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

  // File state
  const [receptorFile, setReceptorFile] = useState<File | null>(null);
  const [ligandFile, setLigandFile] = useState<File | null>(null);

  // RCSB fetch state
  const [pdbId, setPdbId] = useState("");
  const [fetchingReceptor, setFetchingReceptor] = useState(false);

  // PubChem fetch state
  const [compoundQuery, setCompoundQuery] = useState("");
  const [fetchingLigand, setFetchingLigand] = useState(false);

  // Form state
  const [jobName, setJobName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.ok ? r.json() : { jobs: [] })
      .then((d) => setRecentJobs(d.jobs ?? []))
      .catch(() => {});
  }, []);

  // ── RCSB fetch ──────────────────────────────────────────────────────────────
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

  // ── PubChem fetch ───────────────────────────────────────────────────────────
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
      const filename = q.replace(/\s+/g, "_") + ".sdf";
      setLigandFile(new File([blob], filename, { type: "chemical/x-mdl-sdfile" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFetchingLigand(false);
    }
  }

  // ── Load validated pair ─────────────────────────────────────────────────────
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

  // ── Submit ──────────────────────────────────────────────────────────────────
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

      if (!res.ok) {
        setError(data.detail ?? data.error ?? "Submission failed");
        return;
      }
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

        {/* ── Submission form ── */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-stone-800" style={{ fontFamily: "var(--font-source-serif)" }}>Molecular Docking</h1>
            <p className="mt-1 text-sm text-stone-500">
              Upload a receptor PDB and ligand SDF/mol2 file to run AutoDock Vina
              and visualise the docked complex in 3D.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── Receptor ── */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-stone-700">
                Receptor (PDB)
              </label>

              {/* RCSB fetch */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pdbId}
                  onChange={(e) => setPdbId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), fetchFromRCSB())}
                  placeholder="PDB ID — e.g. 1IEP, 2HYY, 1EQG"
                  className="flex-1 rounded-md bg-white border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono placeholder-stone-400 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                />
                <button
                  type="button"
                  onClick={fetchFromRCSB}
                  disabled={!pdbId.trim() || fetchingReceptor}
                  className="px-4 py-2 rounded-md bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white whitespace-nowrap transition-colors"
                >
                  {fetchingReceptor ? "Fetching…" : "Fetch from RCSB"}
                </button>
              </div>

              <p className="text-xs text-stone-400 -mt-1">
                Or upload a PDB file directly:
              </p>
              <FileDropzone
                label="Receptor PDB"
                accept=".pdb"
                file={receptorFile}
                onChange={setReceptorFile}
                hint="Drop .pdb here or click to browse"
              />
            </div>

            {/* ── Ligand ── */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-stone-700">
                Ligand (SDF / mol2)
              </label>

              {/* PubChem fetch */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={compoundQuery}
                  onChange={(e) => setCompoundQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), fetchFromPubChem())}
                  placeholder="Compound name or CID — e.g. Imatinib, 5291, Erlotinib"
                  className="flex-1 rounded-md bg-white border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono placeholder-stone-400 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                />
                <button
                  type="button"
                  onClick={fetchFromPubChem}
                  disabled={!compoundQuery.trim() || fetchingLigand}
                  className="px-4 py-2 rounded-md bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white whitespace-nowrap transition-colors"
                >
                  {fetchingLigand ? "Fetching…" : "Fetch from PubChem"}
                </button>
              </div>

              <p className="text-xs text-stone-400 -mt-1">
                Or upload an SDF / mol2 file directly:
              </p>
              <FileDropzone
                label="Ligand (SDF / mol2)"
                accept=".sdf,.mol2"
                file={ligandFile}
                onChange={setLigandFile}
                hint="Drop .sdf or .mol2 here or click to browse"
              />
            </div>

            {/* ── Job name ── */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-stone-700">
                Job name <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="e.g. Imatinib / ABL1 screen"
                className="w-full rounded-md bg-white border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !receptorFile || !ligandFile}
              className="w-full py-2.5 rounded-md bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
            >
              {loading ? "Submitting…" : "Run Docking"}
            </button>
          </form>

          {/* ── System limitations ── */}
          <div className="pt-6 border-t border-stone-200 space-y-2">
            <p className="text-xs font-semibold text-stone-700 uppercase tracking-widest">System Limitations</p>
            <p className="text-[10px] text-stone-500 leading-relaxed">
              Uses rigid receptor (AutoDock Vina). Results for flexible binding sites may underestimate affinity by 2–3 kcal/mol.
            </p>
            <div className="space-y-1.5">
              {LIMITATIONS.map((lim) => (
                <div key={lim.label} className="rounded border border-amber-100 bg-amber-50 px-2.5 py-2">
                  <p className="text-[10px] font-semibold text-amber-800">{lim.label}</p>
                  <p className="text-[10px] text-amber-700 italic">{lim.examples}</p>
                  <p className="text-[10px] text-stone-500 leading-relaxed mt-0.5">{lim.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Recent docking jobs sidebar ── */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-widest">
            Recent Docking Jobs
          </h2>

          {recentJobs.length === 0 ? (
            <p className="text-xs text-stone-400">
              No jobs yet. Results appear here after completion.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentJobs.map((job) => (
                <li key={job.job_id}>
                  <button
                    onClick={() => router.push(`/results/${job.job_id}`)}
                    className="w-full text-left rounded-md border border-stone-200 bg-white hover:bg-stone-50 px-3 py-2.5 transition-colors"
                  >
                    <p className="text-sm font-medium text-stone-800 truncate">
                      {job.job_name || job.job_id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {timeAgo(job.created_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-stone-400">Results cached for 24 hours.</p>

          <div className="pt-4 border-t border-stone-100 space-y-1.5">
            <p className="text-xs font-medium text-stone-500">Quick links</p>
            <a
              href="https://www.rcsb.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-600"
            >
              RCSB Protein Data Bank ↗
            </a>
            <a
              href="https://pubchem.ncbi.nlm.nih.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-600"
            >
              PubChem Compound Database ↗
            </a>
          </div>

          {/* ── Validated test pairs ── */}
          <div className="pt-4 border-t border-stone-100 space-y-2">
            <div>
              <p className="text-xs font-semibold text-stone-700 uppercase tracking-widest">Validated Test Pairs</p>
              <p className="text-[10px] text-stone-400 mt-0.5">Click to auto-fill and fetch</p>
            </div>
            {VALIDATED_PAIRS.map((pair) => (
              <button
                key={pair.pdb}
                type="button"
                onClick={() => loadPair(pair.pdb, pair.compound)}
                className="w-full text-left rounded-md border border-stone-200 bg-white hover:bg-green-50 hover:border-green-300 px-2.5 py-2 transition-colors group"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-mono font-bold text-stone-800 group-hover:text-green-800">
                    {pair.pdb}
                  </span>
                  <span className="text-[10px] text-stone-400">IC50 {pair.expIC50}</span>
                </div>
                <div className="text-[10px] text-stone-600 truncate">
                  {pair.compound} · {pair.target}
                </div>
                <div className="text-[10px] text-green-700 mt-0.5">{pair.note}</div>
              </button>
            ))}
            <p className="text-[10px] text-stone-400 leading-relaxed">
              Expected ΔG: −5 to −7 weak · −7 to −9 moderate · −9 to −12 strong · below −12 suspicious
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
