import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/dynamo";
import type { PredictionResult } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;

  let job: Record<string, unknown> | null;
  try {
    job = await getJob(jobId);
  } catch {
    return NextResponse.json({ error: "Failed to read job" }, { status: 500 });
  }

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const status = job.status as string;

  if (status === "complete") {
    const result: PredictionResult = JSON.parse(job.result as string);
    return NextResponse.json({
      status: "complete",
      result,
      meta: {
        smiles: job.smiles as string,
        target: job.target as string,
        model: job.model as string,
        cell_panel: job.cell_panel as string,
      },
    });
  }

  if (status === "failed") {
    return NextResponse.json({ status: "failed", error: job.error }, { status: 200 });
  }

  return NextResponse.json({ status });
}
