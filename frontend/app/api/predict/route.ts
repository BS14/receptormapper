import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createJob, getCachedResult } from "@/lib/dynamo";
import { invokeLambda } from "@/lib/lambda";

function cacheKey(smiles: string, target: string, model: string): string {
  return crypto
    .createHash("sha256")
    .update(`${smiles}|${target}|${model}`)
    .digest("hex");
}

export async function POST(req: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const smiles = (body.smiles ?? "").trim();
  const target = (body.target_sequence ?? "").trim();
  const model = body.model ?? "MPNN_CNN_BindingDB_IC50";
  const cellPanel = body.cell_panel ?? "lung";

  if (!smiles || !target) {
    return NextResponse.json(
      { error: "smiles and target_sequence are required" },
      { status: 400 }
    );
  }

  // Cache check — return synchronously if we have a prior result
  const key = cacheKey(smiles, target, `${model}|${cellPanel}`);
  try {
    const cached = await getCachedResult(key);
    if (cached?.result) {
      return NextResponse.json({
        status: "complete",
        source: "cache",
        result: JSON.parse(cached.result as string),
      });
    }
  } catch {
    // non-fatal — fall through to Lambda
  }

  const jobId = uuidv4();
  try {
    await createJob({ job_id: jobId, smiles, target, model, cell_panel: cellPanel });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }

  // Invoke Lambda and wait for it to write the result to DynamoDB.
  // In production (Vercel) switch to InvocationType: "Event" and return 202 immediately.
  try {
    await invokeLambda({ job_id: jobId, smiles, target_sequence: target, model, cell_panel: cellPanel });
  } catch (err) {
    console.error("Lambda invocation failed:", err);
    // job stays "queued" — client will poll and eventually time out
  }

  return NextResponse.json({ status: "queued", job_id: jobId }, { status: 202 });
}
