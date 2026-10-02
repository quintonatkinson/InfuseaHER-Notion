import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getDashboard();
  return NextResponse.json(result, {
    status: result.data ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
