import { NextResponse } from "next/server";
import { getRecentJobs } from "@/lib/dynamo";

export async function GET() {
  try {
    const jobs = await getRecentJobs(10);
    return NextResponse.json({ jobs });
  } catch {
    return NextResponse.json({ jobs: [] });
  }
}
