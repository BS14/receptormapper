"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import SMILESInput from "@/components/SMILESInput";

const EXAMPLE_SMILES = [
  { label: "Paracetamol", value: "CC(=O)Nc1ccc(O)cc1" },
  { label: "Erlotinib", value: "C#Cc1cccc(Nc2ncnc3cc(OCC)c(OCC)cc23)c1" },
  { label: "Imatinib", value: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1" },
  { label: "Aspirin", value: "CC(=O)Oc1ccccc1C(=O)O" },
];

const EXAMPLE_TARGET =
  "MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTFEDHFLSLQRMFNNCEVVLGNLEITYVQRNYDLSFLKTIQEVAGYVLIALNTVERIPLENLQIIRGNMYYENSYALAVLSNYDANKTGLKELPMRNLQEILHGAVRFSNNPALCNVESIQWRDIVSSDFLSNMSMDFQNHLGSCQKCDPSCPNGSCWGAGEENCQKLTKIICAQQCSGRCRGKSPSDCCHNQCAAGCTGPRESDCLVCRKFRDEATCKDTCPPLMLYNPTTYQ";

export default function HomePage() {
  const router = useRouter();
  const [smiles, setSmiles] = useState("");
  const [target, setTarget] = useState("");
  const [model, setModel] = useState("MPNN_CNN_BindingDB_IC50");
  const [panel, setPanel] = useState("lung");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles, target_sequence: target, model, cell_panel: panel }),
      });
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
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Drug-Target Interaction Prediction</h1>
        <p className="mt-1 text-sm text-gray-400">
          Submit a SMILES string and protein target to predict binding affinity,
          off-target effects, cell-line sensitivity, and ADMET properties.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            SMILES String
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {EXAMPLE_SMILES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setSmiles(ex.value)}
                className="px-2 py-0.5 text-xs rounded bg-gray-800 text-indigo-300 hover:bg-gray-700 border border-gray-700"
              >
                {ex.label}
              </button>
            ))}
          </div>
          <SMILESInput value={smiles} onChange={setSmiles} />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Target Protein Sequence (FASTA amino acids)
          </label>
          <button
            type="button"
            onClick={() => setTarget(EXAMPLE_TARGET)}
            className="px-2 py-0.5 text-xs rounded bg-gray-800 text-indigo-300 hover:bg-gray-700 border border-gray-700 mb-2"
          >
            Use EGFR example
          </button>
          <textarea
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            rows={4}
            placeholder="MRPSGTAGAALLALLAALCPAS..."
            className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 font-mono placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500">
            {target.length} amino acids
            {target.length > 0 && target.length < 20 && (
              <span className="text-yellow-500 ml-2">— minimum 20 required</span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-300">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="MPNN_CNN_BindingDB_IC50">MPNN-CNN BindingDB IC50</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-300">Cell Line Panel</label>
            <select
              value={panel}
              onChange={(e) => setPanel(e.target.value)}
              className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
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
          <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !smiles || !target}
          className="w-full py-2.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
        >
          {loading ? "Submitting..." : "Run Prediction"}
        </button>
      </form>
    </div>
  );
}
