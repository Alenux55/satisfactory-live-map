"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";

export function ForgotForm() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forgot", username }),
      });
      const body = (await response.json()) as { message?: string };
      setMessage(body.message ?? "If that account has an email address, a reset link is on its way.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Forgot password" subtitle="We'll email a one-hour reset link if SMTP is configured and this account has an address.">
      <form className="flex flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Username or email</Label>
          <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
