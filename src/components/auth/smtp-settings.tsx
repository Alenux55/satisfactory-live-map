"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatFromHeader, parseFromHeader } from "@/lib/auth/from-header";

type SmtpView = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  publicUrl: string;
  passwordSet: boolean;
  configured: boolean;
};

export function SmtpSettings({ defaultTo }: { defaultTo: string }) {
  const [form, setForm] = useState({
    host: "",
    port: "587",
    secure: false,
    user: "",
    pass: "",
    fromName: "",
    from: "",
    publicUrl: "",
    to: defaultTo,
  });
  const [passwordSet, setPasswordSet] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/admin/smtp", { cache: "no-store" });
    const body = (await response.json()) as SmtpView & { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Could not load mail settings");
      return;
    }
    setForm((current) => ({
      ...current,
      host: body.host,
      port: String(body.port || 587),
      secure: body.secure,
      user: body.user,
      pass: "",
      fromName: parseFromHeader(body.from).name,
      from: parseFromHeader(body.from).address,
      publicUrl: body.publicUrl,
      to: current.to || defaultTo,
    }));
    setPasswordSet(body.passwordSet);
    setConfigured(body.configured);
  };

  useEffect(() => {
    void load();
  }, []);

  const payload = () => ({
    host: form.host,
    port: Number(form.port) || 587,
    secure: form.secure,
    user: form.user,
    pass: form.pass,
    from: formatFromHeader(form.fromName, form.from),
    publicUrl: form.publicUrl,
  });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = (await response.json()) as SmtpView & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not save");
        return;
      }
      setPasswordSet(body.passwordSet);
      setConfigured(body.configured);
      setForm((current) => ({ ...current, pass: "" }));
      setMessage("Saved. Forgot-password mail uses these settings immediately — no restart.");
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), to: form.to }),
      });
      const body = (await response.json()) as { ok?: boolean; to?: string; error?: string };
      if (!response.ok) {
        setError(body.error ?? "Test send failed");
        return;
      }
      setMessage(`Test message sent to ${body.to}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
      <p className="text-sm text-muted-foreground">
        Used for &quot;Forgot your password&quot;. Mailcow: host is your mail hostname, user is the full
        mailbox. TurboSMTP direct: host <span className="font-mono">pro.turbo-smtp.com</span>, user/pass
        are the Consumer Key and Secret. Port 587 is STARTTLS; 465 is implicit TLS.
      </p>
      <p className="font-mono text-[11px] text-muted-foreground">
        {configured ? "Outbound mail is configured." : "Host and From are required before mail will send."}
        {passwordSet ? " Password is stored." : " No password stored yet."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="smtp-host">SMTP host</Label>
          <Input
            id="smtp-host"
            value={form.host}
            onChange={(event) => setForm({ ...form, host: event.target.value })}
            placeholder="mail.example.com or pro.turbo-smtp.com"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-port">Port</Label>
          <Input
            id="smtp-port"
            inputMode="numeric"
            value={form.port}
            onChange={(event) => {
              const port = event.target.value;
              setForm({
                ...form,
                port,
                secure: Number(port) === 465 ? true : form.secure,
              });
            }}
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Switch
            id="smtp-secure"
            checked={form.secure}
            onCheckedChange={(secure) => setForm({ ...form, secure })}
          />
          <Label htmlFor="smtp-secure" className="text-sm font-normal">
            Implicit TLS (port 465)
          </Label>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-user">Username</Label>
          <Input
            id="smtp-user"
            value={form.user}
            onChange={(event) => setForm({ ...form, user: event.target.value })}
            placeholder="you@example.com"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-pass">Password</Label>
          <Input
            id="smtp-pass"
            type="password"
            value={form.pass}
            onChange={(event) => setForm({ ...form, pass: event.target.value })}
            placeholder={passwordSet ? "Leave blank to keep current" : "Mailbox or API secret"}
            autoComplete="new-password"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-from-name">From name</Label>
          <Input
            id="smtp-from-name"
            value={form.fromName}
            onChange={(event) => setForm({ ...form, fromName: event.target.value })}
            placeholder="FICSIT Notifications"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-from">From address</Label>
          <Input
            id="smtp-from"
            type="email"
            value={form.from}
            onChange={(event) => setForm({ ...form, from: event.target.value })}
            placeholder="ficsit@example.com"
            required
          />
        </div>
        <p className="text-[11px] text-muted-foreground sm:col-span-2">
          Name is what people see in their inbox. Address still has to be a mailbox your SMTP server
          will send as.
        </p>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="smtp-public">Public map URL</Label>
          <Input
            id="smtp-public"
            value={form.publicUrl}
            onChange={(event) => setForm({ ...form, publicUrl: event.target.value })}
            placeholder="http://10.0.0.25:43147"
          />
          <p className="text-[11px] text-muted-foreground">
            Origin pasted into reset emails. Use the address people actually open in a browser.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3">
        <Label htmlFor="smtp-to">Send a test to</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="smtp-to"
            type="email"
            value={form.to}
            onChange={(event) => setForm({ ...form, to: event.target.value })}
            placeholder="you@example.com"
          />
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void test()}>
            {busy === "test" ? "Sending…" : "Send test"}
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-primary">{message}</p> : null}
      <div>
        <Button type="submit" disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save mail settings"}
        </Button>
      </div>
    </form>
  );
}
