"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6">
      <div>
        <BrandMark />
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="font-heading text-2xl">Admin</h1>
          <Button size="sm" variant="outline" onClick={() => router.push("/")}>
            Back to map
          </Button>
        </div>
        <nav className="mt-3 flex gap-1 rounded-lg border border-border bg-card/60 p-1">
          <Link
            href="/admin/users"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              pathname === "/admin/users" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Accounts
          </Link>
          <Link
            href="/admin/settings"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              pathname === "/admin/settings"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Settings
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
