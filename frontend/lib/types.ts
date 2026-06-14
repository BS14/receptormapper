export interface NativeDocking {
  delta_g: number;
  pIC50: number;
  ic50_nM: number;
  delta_delta_g: number;
  selectivity: "stronger" | "similar" | "weaker";
}

export interface RmsdResult {
  available: boolean;
  native_resname?: string;
  native_heavy_count?: number;
  native_center?: number[];
  docked_center?: number[];
  pocket_distance_A?: number;
  mode?: "self_docking" | "cross_docking";
  tanimoto?: number;
  ligand_rmsd_A?: number | null;
  success?: boolean | null;
}

export interface PoseResult {
  rank: number;
  delta_g: number;
  pic50: number;
  ic50_nM: number;
  pocket_distance_A?: number;
  rmsd_A?: number | null;
}

export interface BindingResult {
  pIC50: number;
  delta_g: number;
  ic50_nM: number;
  confidence: number;
  strength: "strong" | "moderate" | "weak";
  docked_complex_url?: string;
  docked_complex_key?: string;
  rmsd?: RmsdResult;
  native_docking?: NativeDocking | null;
  poses?: PoseResult[];
}

export interface PredictionFlag {
  type: string;
  level: "danger" | "warning" | "info";
  message: string;
}

export interface PredictionSummary {
  total_flags: number;
}

export interface PredictionInputs {
  job_id?: string;
  receptor_name?: string;
  ligand_name?: string;
  smiles?: string;
}

export interface PredictionResult {
  binding: BindingResult;
  flags: PredictionFlag[];
  summary: PredictionSummary;
  inputs?: PredictionInputs;
}

export interface JobMeta {
  job_name: string;
  job_id?: string;
}

export type JobStatus = "queued" | "running" | "complete" | "failed";
