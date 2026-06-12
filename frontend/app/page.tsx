"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SMILESInput from "@/components/SMILESInput";
import FileDropzone from "@/components/FileDropzone";

const MODEL_INFO: Record<string, { label: string; framework: string; dataset: string; note: string }> = {
  MPNN_CNN_BindingDB_IC50: {
    label: "MPNN-CNN",
    framework: "DeepPurpose",
    dataset: "BindingDB IC50",
    note: "Message-passing drug encoder + CNN protein encoder",
  },
  TDC_DeepDTA_DAVIS: {
    label: "DeepDTA",
    framework: "TDC / PyTDC",
    dataset: "DAVIS Kd",
    note: "CNN drug + CNN protein encoder, trained on kinase panel",
  },
};

const EXAMPLE_SMILES = [
  { label: "Paracetamol", value: "CC(=O)Nc1ccc(O)cc1" },
  { label: "Erlotinib", value: "C#Cc1cccc(Nc2ncnc3cc(OCC)c(OCC)cc23)c1" },
  { label: "Imatinib", value: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1" },
  { label: "Aspirin", value: "CC(=O)Oc1ccccc1C(=O)O" },
];

const EXAMPLE_TARGET =
  "MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTFEDHFLSLQRMFNNCEVVLGNLEITYVQRNYDLSFLKTIQEVAGYVLIALNTVERIPLENLQIIRGNMYYENSYALAVLSNYDANKTGLKELPMRNLQEILHGAVRFSNNPALCNVESIQWRDIVSSDFLSNMSMDFQNHLGSCQKCDPSCPNGSCWGAGEENCQKLTKIICAQQCSGRCRGKSPSDCCHNQCAAGCTGPRESDCLVCRKFRDEATCKDTCPPLMLYNPTTYQ";

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
  smiles: string;
  model: string;
  created_at: number;
  completed_at?: number;
}

export default function HomePage() {
  const router = useRouter();
  const [smiles, setSmiles] = useState("");
  const [compoundName, setCompoundName] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [model, setModel] = useState("Vina");
  const [panel, setPanel] = useState("lung");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [receptorFile, setReceptorFile] = useState<File | null>(null);
  const [ligandFile, setLigandFile] = useState<File | null>(null);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.ok ? r.json() : { jobs: [] })
      .then((d) => setRecentJobs(d.jobs ?? []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const fd = new FormData();
      if (smiles) fd.append("smiles", smiles);
      if (target) fd.append("target_sequence", target);
      if (receptorFile) fd.append("receptor_pdb", receptorFile);
      if (ligandFile) fd.append("ligand_file", ligandFile);
      fd.append("model", model);
      fd.append("cell_panel", panel);
      if (compoundName) fd.append("job_name", compoundName);

      const res = await fetch("/api/predict", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Submission failed");
        return;
      }

      if (data.status === "complete") {
        sessionStorage.setItem("result_cache", JSON.stringify({
          result: data.result,
          meta: { smiles, target, model, cell_panel: panel },
        }));
        router.push(`/results/cache`);
      } else {
        router.push(`/results/${data.job_id}`);
      }
    } catch {
      setError("Network error — is the server running?");
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
            <h1 className="text-2xl font-bold text-stone-800">Drug-Target Interaction Prediction</h1>
            <p className="mt-1 text-sm text-stone-500">
              Submit a SMILES string and protein target to predict binding affinity,
              off-target effects, cell-line sensitivity, and ADMET properties.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── File uploads ── */}
            <div className="grid grid-cols-2 gap-3">
              <FileDropzone
                label="Receptor (PDB)"
                accept=".pdb"
                file={receptorFile}
                onChange={setReceptorFile}
                hint="Upload .pdb file or use sequence below"
              />
              <FileDropzone
                label="Ligand (mol2 / SDF)"
                accept=".mol2,.sdf"
                file={ligandFile}
                onChange={setLigandFile}
                hint="Upload .mol2/.sdf or enter SMILES below"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-stone-700">
                SMILES String <span className="text-stone-400 font-normal">(or upload ligand above)</span>
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {EXAMPLE_SMILES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => setSmiles(ex.value)}
                    className="px-2 py-0.5 text-xs rounded bg-stone-100 text-green-700 hover:bg-stone-200 border border-stone-300"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
              <SMILESInput value={smiles} onChange={setSmiles} onNameChange={setCompoundName} />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-stone-700">
                Target Protein Sequence <span className="text-stone-400 font-normal">(or upload PDB above)</span>
              </label>
              <button
                type="button"
                onClick={() => setTarget(EXAMPLE_TARGET)}
                className="px-2 py-0.5 text-xs rounded bg-stone-100 text-green-700 hover:bg-stone-200 border border-stone-300 mb-2"
              >
                Use EGFR example
              </button>
              <textarea
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                rows={4}
                placeholder="MRPSGTAGAALLALLAALCPAS..."
                className="w-full rounded-md bg-white border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono placeholder-stone-400 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
              <p className="text-xs text-stone-500">
                {target.length} amino acids
                {target.length > 0 && target.length < 20 && (
                  <span className="text-yellow-600 ml-2">— minimum 20 required</span>
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-stone-700">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-md bg-white border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                >
                  <optgroup label="DeepPurpose">
                    <option value="MPNN_CNN_BindingDB_IC50">MPNN-CNN · BindingDB IC50</option>
                  </optgroup>
                  <optgroup label="TDC / PyTDC">
                    <option value="TDC_DeepDTA_DAVIS">DeepDTA · DAVIS Kd</option>
                  </optgroup>
                </select>
                {MODEL_INFO[model] && (
                  <p className="text-xs text-stone-500 mt-1">
                    <span className="text-green-700 font-medium">{MODEL_INFO[model].framework}</span>
                    {" · "}{MODEL_INFO[model].dataset}
                    {" — "}{MODEL_INFO[model].note}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-stone-700">Cell Line Panel</label>
                <select
                  value={panel}
                  onChange={(e) => setPanel(e.target.value)}
                  className="w-full rounded-md bg-white border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                >
                  <optgroup label="── Cancer ──────────────">
                    <option value="lung">Lung (12 lines)</option>
                    <option value="breast">Breast (10 lines)</option>
                    <option value="colorectal">Colorectal (12 lines)</option>
                    <option value="prostate">Prostate (10 lines)</option>
                    <option value="ovarian">Ovarian (10 lines)</option>
                    <option value="pancreatic">Pancreatic (10 lines)</option>
                    <option value="leukemia">Leukemia / Hematological (12 lines)</option>
                    <option value="melanoma">Melanoma (10 lines)</option>
                    <option value="glioblastoma">Glioblastoma / Brain (10 lines)</option>
                    <option value="liver">Liver / HCC (10 lines)</option>
                    <option value="renal">Renal / Kidney (10 lines)</option>
                    <option value="pan">Pan-cancer (20 lines)</option>
                  </optgroup>
                  <optgroup label="── Metabolic / Other ───">
                    <option value="diabetic">Diabetic / Metabolic (10 lines)</option>
                    <option value="neurological">Neurological (10 lines)</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || (!smiles && !ligandFile) || (!target && !receptorFile)}
              className="w-full py-2.5 rounded-md bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
            >
              {loading ? "Submitting…" : "Run Prediction"}
            </button>
          </form>
        </div>

        {/* ── Recent predictions sidebar ── */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-widest">
            Recent Predictions
          </h2>

          {recentJobs.length === 0 ? (
            <p className="text-xs text-stone-400">No predictions yet. Results appear here after completion.</p>
          ) : (
            <ul className="space-y-2">
              {recentJobs.map((job) => (
                <li key={job.job_id}>
                  <button
                    onClick={() => router.push(`/results/${job.job_id}`)}
                    className="w-full text-left rounded-md border border-stone-200 bg-white hover:bg-stone-50 px-3 py-2.5 transition-colors"
                  >
                    <p className="text-sm font-medium text-stone-800 truncate">
                      {job.job_name || job.smiles.slice(0, 24) + "…"}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5 truncate">
                      {MODEL_INFO[job.model]?.label ?? job.model}
                      {" · "}
                      {timeAgo(job.created_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-stone-400">Predictions expire after 24 hours.</p>
        </div>

      </div>
    </div>
  );
}
