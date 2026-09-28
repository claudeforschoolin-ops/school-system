import { redirect } from "next/navigation";
import { flattenPermissions } from "@/lib/rbac/access";
import { getCurrentSession } from "@/server/auth/current";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.requires2faChallenge) redirect("/two-factor");
  if (session.requires2faSetup) redirect("/setup-2fa");
  const initial = {
    user: session.user,
    tenant: session.tenant,
    roles: session.access.assignments.map((a) => ({ key: a.roleKey, name: a.roleName, branchId: a.branchId, stageId: a.stageId })),
    permissions: flattenPermissions(session.access),
    requires2faSetup: session.requires2faSetup,
    sessionId: session.sessionId,
  };
  return <AppShell initial={initial}>{children}</AppShell>;
}
