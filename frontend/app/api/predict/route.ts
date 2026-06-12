import { NextRequest, NextResponse } from "next/server";

const FASTAPI = (process.env.FASTAPI_URL ?? "http://localhost:8000").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  try {
    const body = await req.formData();
    const res = await fetch(`${FASTAPI}/predict`, {
      method: "POST",
      body,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "API unreachable" }, { status: 502 });
  }
}
