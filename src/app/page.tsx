import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { currentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (!session) redirect("/login");
  return <Dashboard who={session.who} />;
}
