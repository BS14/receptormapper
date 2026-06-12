import { NextResponse } from "next/server";

const FASTAPI = (process.env.FASTAPI_URL ?? "http://localhost:8000").replace(/\/$/, "");

export async function GET() {
  try {
    const res = await fetch(`${FASTAPI}/jobs`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ jobs: [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
