// Login session: a cookie holding who you are and when it expires, signed
// with SESSION_SECRET so it can't be forged or edited. Server-side only
// (used by proxy.ts and API routes); never imported by browser code.

export const SESSION_COOKIE = "infuseher_session";
export const SESSION_DAYS = 30;
export const PEOPLE = ["Quinton", "Chelsey"] as const;
export type Person = (typeof PEOPLE)[number];

export interface Session {
  who: Person;
  exp: number; // ms since epoch
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function secret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is missing or shorter than 32 characters.");
  return s;
}

async function key() {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function createSession(who: Person): Promise<{ token: string; expires: Date }> {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const body = b64url(enc.encode(JSON.stringify({ who, exp } satisfies Session)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  return { token: `${body}.${b64url(sig)}`, expires: new Date(exp) };
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), fromB64url(sig) as BufferSource, enc.encode(body));
    if (!ok) return null;
    const session = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (!PEOPLE.includes(session.who) || typeof session.exp !== "number" || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    // Secure cookies only work over https. Locally (and on your phone over
    // Wi-Fi) the dev server is plain http, so only require it in production.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
