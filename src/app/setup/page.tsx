import { redirect } from "next/navigation";
import { SetupForm } from "@/components/auth/setup-form";
import { userCount } from "@/lib/auth/store";

export default async function SetupPage() {
  if ((await userCount()) > 0) redirect("/login");
  return <SetupForm />;
}
