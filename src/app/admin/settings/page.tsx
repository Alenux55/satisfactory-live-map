import { SmtpSettings } from "@/components/auth/smtp-settings";
import { currentUser } from "@/lib/auth/guard";

export default async function AdminSettingsPage() {
  const user = await currentUser();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Mail server</p>
      <SmtpSettings defaultTo={user?.email ?? ""} />
    </div>
  );
}
