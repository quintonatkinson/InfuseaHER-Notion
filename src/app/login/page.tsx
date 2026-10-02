"use client";

import { useState } from "react";

export default function LoginPage() {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(who: "Quinton" | "Chelsey") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase, who }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't log in.");
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="page login">
      <p className="eyebrow">InfuseHER</p>
      <h1>Welcome back</h1>
      <form onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="passphrase">Passphrase</label>
        <input
          id="passphrase"
          type="password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoFocus
        />
        <p className="hint">Who&rsquo;s using the dashboard?</p>
        <div className="who">
          <button type="button" disabled={busy || !passphrase} onClick={() => login("Quinton")}>
            I&rsquo;m Quinton
          </button>
          <button type="button" disabled={busy || !passphrase} onClick={() => login("Chelsey")}>
            I&rsquo;m Chelsey
          </button>
        </div>
        {error && (
          <p className="banner error" role="alert">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
