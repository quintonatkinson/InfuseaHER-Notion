import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookieOptions, createSession, PEOPLE, SESSION_COOKIE, type Person } from "@/lib/session";

function sameText(a: string, b: string): boolean {
  // Compare hashes so the check takes the same time whatever was typed.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: Request) {
  const expected = process.env.APP_PASSPHRASE?.trim();
  if (!expected || !process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: "Login isn't set up yet: APP_PASSPHRASE and SESSION_SECRET need to be set." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { passphrase?: string; who?: string };
  const who = PEOPLE.find((p) => p === body.who) as Person | undefined;
  if (!who) return NextResponse.json({ error: "Choose Quinton or Chelsey." }, { status: 400 });

  if (!sameText((body.passphrase ?? "").trim(), expected)) {
    // A short pause makes guessing the passphrase slow.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "That passphrase isn't right." }, { status: 401 });
  }

  const { token, expires } = await createSession(who);
  const res = NextResponse.json({ ok: true, who });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(expires));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(new Date(0)));
  return res;
}
