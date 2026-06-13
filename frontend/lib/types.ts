export interface BindingResult {
  pIC50: number;
  delta_g: number;
  ic50_nM: number;
  confidence: number;
  strength: "strong" | "moderate" | "weak";
  docked_complex_url?: string;
  docked_complex_key?: string;
}

export interface PredictionFlag {
  type: string;
  level: "danger" | "warning" | "info";
  message: string;
}

export interface PredictionSummary {
  total_flags: number;
}

export interface PredictionResult {
  binding: BindingResult;
  flags: PredictionFlag[];
  summary: PredictionSummary;
}

export interface JobMeta {
  job_name: string;
}

export type JobStatus = "queued" | "running" | "complete" | "failed";
