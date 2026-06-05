import { NextResponse } from "next/server";

const FASTAPI = (process.env.FASTAPI_URL ?? "http://localhost:8000").replace(/\/$/, "");

export async function GET() {
  try {
    const res = await fetch(`${FASTAPI}/jobs`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ jobs: [] });
  }
}
