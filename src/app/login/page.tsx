import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { currentUser } from "@/lib/auth/guard";
import { userCount } from "@/lib/auth/store";

export default async function LoginPage() {
  if ((await userCount()) === 0) redirect("/setup");
  if (await currentUser()) redirect("/");
  return <LoginForm />;
}
