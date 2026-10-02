import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { normaliseId, notionConfig } from "@/lib/config";
import { getDashboard, invalidateDashboard } from "@/lib/dashboard";
import { InvalidValueError, setTaskStatus } from "@/lib/notion/load";

export const dynamic = "force-dynamic";

// Changes one task's Status (ticking a card, or undoing that).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const id = normaliseId((await ctx.params).id);
  const { status } = (await request.json().catch(() => ({}))) as { status?: string };
  if (!status) return NextResponse.json({ error: "No status given." }, { status: 400 });

  // Only ever write to pages that are rows of the Tasks database.
  const current = await getDashboard();
  const task = current.data?.tasks.find((t) => t.id === id);
  if (!task || notionConfig().blockedPageIds.includes(id)) {
    return NextResponse.json({ error: "That isn't a task this dashboard knows about." }, { status: 404 });
  }

  try {
    await setTaskStatus(id, status);
  } catch (err) {
    if (err instanceof InvalidValueError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json(
      { error: `Couldn't update Notion: ${(err as Error).message}`, source: "notion" },
      { status: 502 },
    );
  }
  console.log(`[write] ${session.who} set "${task.title}" Status ${task.status ?? "(blank)"} -> ${status}`);

  invalidateDashboard();
  const fresh = await getDashboard();
  return NextResponse.json({ ok: true, previousStatus: task.status, dashboard: fresh });
}
