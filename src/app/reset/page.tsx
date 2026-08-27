import { redirect } from "next/navigation";
import { ResetForm } from "@/components/auth/reset-form";
import { userCount } from "@/lib/auth/store";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if ((await userCount()) === 0) redirect("/setup");
  const { token } = await searchParams;
  return <ResetForm token={token ?? ""} />;
}
