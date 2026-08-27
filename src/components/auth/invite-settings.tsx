"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InvitePublicView } from "@/lib/auth/types";
import { MIN_INVITE_CODE_LENGTH } from "@/lib/auth/types";

export function InviteSettings() {
  const [emails, setEmails] = useState("");
  const [code, setCode] = useState("");
  const [codeSet, setCodeSet] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState<"save" | "generate" | "disable" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (body: InvitePublicView) => {
    setEmails(body.emails.join("\n"));
    setCodeSet(body.codeSet);
    setEnabled(body.enabled);
  };

  const load = async () => {
    const response = await fetch("/api/admin/invite", { cache: "no-store" });
    const body = (await response.json()) as InvitePublicView & { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Could not load invite settings");
      return;
    }
    apply(body);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/invite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, code }),
      });
      const body = (await response.json()) as InvitePublicView & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not save");
        return;
      }
      apply(body);
      setCode("");
      setMessage(
        body.enabled
          ? "Saved. Friends on the list can create a viewer account with this invite code."
          : "Saved. Sign-up stays off until you set an invite code and at least one email.",
      );
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setBusy("generate");
    setError(null);
    try {
      const response = await fetch("/api/admin/invite", { method: "POST" });
      const body = (await response.json()) as { code?: string; error?: string };
      if (!response.ok || !body.code) {
        setError(body.error ?? "Could not generate a code");
        return;
      }
      setCode(body.code);
      setMessage("Copy this code, then save. It is not shown again after you leave this page.");
    } finally {
      setBusy(null);
    }
  };

  const disable = async () => {
    setBusy("disable");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/invite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disable: true }),
      });
      const body = (await response.json()) as InvitePublicView & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not turn off sign-up");
        return;
      }
      apply(body);
      setCode("");
      setMessage("Viewer sign-up is off. The email list is unchanged.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
      <p className="text-sm text-muted-foreground">
        Friends create their own viewer account on the sign-in page. They must use an email from this list
        and the invite code. The code is stored hashed — copy it before you save.
      </p>
      <p className="font-mono text-[11px] text-muted-foreground">
        {enabled
          ? "Viewer sign-up is on."
          : codeSet
            ? "Invite code is set, but sign-up stays off until the list has at least one email."
            : "Viewer sign-up is off until you set a code and at least one email."}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-emails">Allowed emails</Label>
        <textarea
          id="invite-emails"
          className="min-h-28 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          value={emails}
          onChange={(event) => setEmails(event.target.value)}
          placeholder={"friend@example.com\nother@example.com"}
        />
        <p className="text-[11px] text-muted-foreground">One per line, or separated by commas.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-code">Invite code</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="invite-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={codeSet ? "Leave blank to keep the current code" : "At least 6 characters"}
            minLength={code ? MIN_INVITE_CODE_LENGTH : undefined}
            autoComplete="off"
          />
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void generate()}>
            {busy === "generate" ? "…" : "Generate"}
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-primary">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save invite settings"}
        </Button>
        {codeSet ? (
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void disable()}>
            {busy === "disable" ? "…" : "Turn off sign-up"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
