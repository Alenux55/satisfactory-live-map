"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicUser, UserRole } from "@/lib/auth/types";
import { PasswordPair, passwordsMatch } from "@/components/auth/password-pair";

export function UsersAdmin({ selfId }: { selfId: string }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch("/api/auth/users", { cache: "no-store" });
    const body = (await response.json()) as { users?: PublicUser[]; error?: string };
    if (!response.ok) {
      setError(body.error ?? "Could not load users");
      return;
    }
    setUsers(body.users ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const mismatch = passwordsMatch(password, confirm);
    if (mismatch) {
      setError(mismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, passwordConfirm: confirm, role }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not create user");
        return;
      }
      setUsername("");
      setEmail("");
      setPassword("");
      setConfirm("");
      setRole("viewer");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setRoleFor = async (id: string, next: UserRole) => {
    setError(null);
    const response = await fetch("/api/auth/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role: next }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) setError(body.error ?? "Update failed");
    await load();
  };

  const resetPassword = async (id: string) => {
    const next = window.prompt("New password (8+ characters)");
    if (!next) return;
    setError(null);
    const response = await fetch("/api/auth/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password: next }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) setError(body.error ?? "Could not set password");
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this account?")) return;
    setError(null);
    const response = await fetch(`/api/auth/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) setError(body.error ?? "Could not delete");
    await load();
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Admins can change the server catalog. Viewers pick a world and their own layers.
      </p>

      <form className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2" onSubmit={(event) => void create(event)}>
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:col-span-2">
          Add account
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-user">Username</Label>
          <Input id="new-user" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-email">Email</Label>
          <Input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional, needed for reset mail" />
        </div>
        <PasswordPair
          idPrefix="new-pass"
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          passwordLabel="Password"
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-role">Role</Label>
          <select
            id="new-role"
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            Create account
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2">
        {users.map((user) => (
          <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <div>
              <p className="font-medium">
                {user.username}{" "}
                <span className="font-mono text-[11px] text-muted-foreground">{user.role}</span>
                {user.id === selfId ? <span className="ml-1 text-[11px] text-primary">you</span> : null}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">{user.email ?? "no email"}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={user.id === selfId}
                onClick={() => void setRoleFor(user.id, user.role === "admin" ? "viewer" : "admin")}
              >
                Make {user.role === "admin" ? "viewer" : "admin"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void resetPassword(user.id)}>
                Set password
              </Button>
              <Button size="sm" variant="ghost" disabled={user.id === selfId} onClick={() => void remove(user.id)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
