import { SampleWorkspace } from "@/components/sample-workspace";
import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/server/auth";
import { sandboxOwnerId } from "@/lib/premium/billing-mode";
export const metadata = { title: "Sample hiring workspace" };
export default async function Page() {
  const context = await getSessionContext();
  if (!context.user || context.user.id !== sandboxOwnerId) notFound();
  const role = await context.supabase!.rpc("my_staff_role");
  if (role.error || role.data !== "admin") notFound();
  return (
    <main id="main" className="container page-main">
      <p className="eyebrow">Explore a more thoughtful hiring journey</p>
      <h1>Your sample hiring workspace.</h1>
      <SampleWorkspace />
    </main>
  );
}
