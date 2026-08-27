"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/types";

export function PasswordPair({
  password,
  confirm,
  onPassword,
  onConfirm,
  idPrefix = "password",
  passwordLabel = "Password",
  confirmLabel = "Re-enter password",
  autoComplete = "new-password",
}: {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  idPrefix?: string;
  passwordLabel?: string;
  confirmLabel?: string;
  autoComplete?: string;
}) {
  const mismatch = confirm.length > 0 && password !== confirm;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idPrefix}>{passwordLabel}</Label>
        <Input
          id={idPrefix}
          type="password"
          autoComplete={autoComplete}
          value={password}
          onChange={(event) => onPassword(event.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-confirm`}>{confirmLabel}</Label>
        <Input
          id={`${idPrefix}-confirm`}
          type="password"
          autoComplete={autoComplete}
          value={confirm}
          onChange={(event) => onConfirm(event.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          aria-invalid={mismatch}
        />
        {mismatch ? <p className="text-sm text-destructive">Passwords do not match</p> : null}
      </div>
    </>
  );
}

export function passwordsMatch(password: string, confirm: string): string | null {
  if (password !== confirm) return "Passwords do not match";
  return null;
}
