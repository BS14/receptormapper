export interface SubmissionMeta {
  smiles: string;
  target: string;
  model: string;
  cell_panel: string;
}

export interface BindingResult {
  pIC50: number;
  delta_g: number;
  ic50_nM: number;
  confidence: number;
  strength: "strong" | "moderate" | "weak";
}

export interface OffTargetEntry {
  name: string;
  family: string;
  pic50: number;
  risk: "high" | "medium" | "low" | "unknown";
  flag: boolean;
}

export interface CellLineEntry {
  name: string;
  ic50: number;
}

export interface AdmetResult {
  mw: number;
  logP: number;
  hbd: number;
  hba: number;
  tpsa: number;
  rotatable_bonds: number;
  aromatic_rings: number;
  ro5_violations: number;
  drug_like: boolean;
}

export interface TanimotoResult {
  max_tanimoto: number;
  mean_top10: number;
  adj_confidence: number;
  extrapolation_risk: boolean;
}

export interface PredictionFlag {
  type: string;
  level: "danger" | "warning" | "info";
  message: string;
}

export interface PredictionSummary {
  total_flags: number;
  high_risk_ots: number;
  sensitive_lines: number;
}

export interface PredictionResult {
  binding: BindingResult;
  offtarget: OffTargetEntry[];
  cellline: CellLineEntry[];
  admet: AdmetResult;
  tanimoto: TanimotoResult;
  flags: PredictionFlag[];
  summary: PredictionSummary;
}

export type JobStatus = "queued" | "running" | "complete" | "failed";

export interface JobRecord {
  job_id: string;
  job_name: string;
  smiles: string;
  target: string;
  model: string;
  status: JobStatus;
  result?: string;
  error?: string;
  created_at: number;
  completed_at?: number;
  ttl?: number;
}
