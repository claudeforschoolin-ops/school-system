"use client";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => (router.replace("/login"), router.refresh()) });
  return (
    <Button variant="secondary" className="w-full" loading={logout.isPending} onClick={() => logout.mutate()}>
      تسجيل الخروج
    </Button>
  );
}
