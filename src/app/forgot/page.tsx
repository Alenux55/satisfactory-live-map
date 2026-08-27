import { redirect } from "next/navigation";
import { ForgotForm } from "@/components/auth/forgot-form";
import { userCount } from "@/lib/auth/store";

export default async function ForgotPage() {
  if ((await userCount()) === 0) redirect("/setup");
  return <ForgotForm />;
}
