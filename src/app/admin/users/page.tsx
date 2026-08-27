import { redirect } from "next/navigation";
import { UsersAdmin } from "@/components/auth/users-admin";
import { currentUser } from "@/lib/auth/guard";

export default async function AdminUsersPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <UsersAdmin selfId={user.id} />;
}
