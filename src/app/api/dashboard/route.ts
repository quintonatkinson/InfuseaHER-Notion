import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const result = await getDashboard();
  return NextResponse.json(result, {
    status: result.data ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
