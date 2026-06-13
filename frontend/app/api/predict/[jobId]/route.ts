import { NextRequest, NextResponse } from "next/server";

const FASTAPI = (process.env.FASTAPI_URL ?? "http://localhost:8000").replace(/\/$/, "");

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const res = await fetch(`${FASTAPI}/jobs/${params.jobId}`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "API unreachable" }, { status: 502 });
  }
}
