import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/auth/admin-shell";
import { currentUser } from "@/lib/auth/guard";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
  params: Promise<Record<string, never>>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AdminShell>{children}</AdminShell>;
}
