import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-sm">
        <BrandMark />
        <h1 className="mt-2 font-heading text-xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-4">{children}</div>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">
            Live map
          </Link>
        </p>
      </div>
    </div>
  );
}
