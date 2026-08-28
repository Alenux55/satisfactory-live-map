import { redirect } from "next/navigation";
import { LiveMap } from "@/components/map/live-map";
import { currentUser } from "@/lib/auth/guard";
import { userCount } from "@/lib/auth/store";
import { toPublicUser } from "@/lib/auth/types";

export default async function Home() {
  if ((await userCount()) === 0) redirect("/setup");
  const user = await currentUser();
  if (!user) redirect("/login");
  return <LiveMap initialUser={toPublicUser(user)} />;
}
