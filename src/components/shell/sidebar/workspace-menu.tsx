"use client";
/** رأس الشريط الجانبي: شعار المدرسة واسمها + قائمة الحساب */
import { ChevronsUpDown, LogOut, Monitor, Moon, Settings, ShieldCheck, Sun, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useApp } from "../app-context";

export function WorkspaceMenu() {
  const { user, tenant, prefs, setPrefs, data } = useApp();
  const router = useRouter();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      router.replace("/login");
      router.refresh();
    },
  });
  return (
    <Menu>
      <MenuTrigger asChild>
        <button data-tour="workspace" className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-start transition-colors duration-[120ms] hover:bg-hover">
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt="" className="size-6 rounded-md object-cover" />
          ) : (
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-navy-700 text-white dark:text-on-primary">
              <svg viewBox="0 0 64 64" className="size-4" aria-hidden>
                <path d="M18 44V22l14 12 14-12v22" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium leading-5 text-fg">{tenant.name}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-fg-3" />
        </button>
      </MenuTrigger>
      <MenuContent className="w-[260px]">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={user.name} color={user.avatarColor} src={user.avatarUrl} size={32} />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium">{user.name}</p>
            <p className="truncate text-[12px] text-fg-3">{data.roles.map((r) => r.name).join("، ")}</p>
          </div>
        </div>
        <MenuSeparator />
        <MenuItem icon={<UserRound className="size-4" />} onSelect={() => router.push("/settings/profile")}>
          الملف الشخصي
        </MenuItem>
        <MenuItem icon={<ShieldCheck className="size-4" />} onSelect={() => router.push("/privacy")}>
          خصوصيتي
        </MenuItem>
        <MenuItem icon={<Settings className="size-4" />} onSelect={() => router.push("/settings")}>
          الإعدادات
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>المظهر</MenuLabel>
        <MenuRadioGroup value={prefs.theme} onValueChange={(v) => setPrefs({ theme: v as typeof prefs.theme })}>
          <MenuRadioItem value="light" icon={<Sun className="size-4" />}>
            فاتح
          </MenuRadioItem>
          <MenuRadioItem value="dark" icon={<Moon className="size-4" />}>
            داكن
          </MenuRadioItem>
          <MenuRadioItem value="system" icon={<Monitor className="size-4" />}>
            تلقائي
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem icon={<LogOut className="size-4" />} onSelect={() => logout.mutate()}>
          تسجيل الخروج
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
