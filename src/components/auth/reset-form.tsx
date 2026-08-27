"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", token, password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Reset failed");
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Reset password" subtitle="That link is missing a token. Request a new one from the sign-in page.">
        <p className="text-sm text-muted-foreground">No token in the URL.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form className="flex flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </Button>
      </form>
    </AuthShell>
  );
}
