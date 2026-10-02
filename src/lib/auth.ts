import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSession, SESSION_COOKIE, type Session } from "./session";

export async function currentSession(): Promise<Session | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value).catch(() => null);
}

// For API routes: returns the session, or a 401 response to send back.
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await currentSession();
  return session ?? NextResponse.json({ error: "Not logged in" }, { status: 401 });
}
