import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { currentUser } from "@/lib/auth/guard";
import { inviteSignupEnabled } from "@/lib/auth/invite-store";
import { userCount } from "@/lib/auth/store";

export default async function SignupPage() {
  if ((await userCount()) === 0) redirect("/setup");
  if (await currentUser()) redirect("/");
  if (!(await inviteSignupEnabled())) redirect("/login");
  return <SignupForm />;
}
