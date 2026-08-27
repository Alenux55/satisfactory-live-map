import { UsersAdmin } from "@/components/auth/users-admin";
import { currentUser } from "@/lib/auth/guard";

export default async function AdminUsersPage() {
  const user = await currentUser();
  return <UsersAdmin selfId={user!.id} />;
}
