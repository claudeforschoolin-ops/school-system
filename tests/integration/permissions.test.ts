import { describe, expect, it } from "vitest";
import { rootDb } from "@/server/db/client";
import { callerFor, makeTenant, makeUser } from "./helpers";

describe("الصلاحيات عبر واجهة tRPC", () => {
  it("المعلم لا يصل لإدارة المستخدمين ولا الأدوار ولا سجل التدقيق", async () => {
    const t = await makeTenant();
    const teacher = await makeUser(t, "TEACHER");
    const { caller } = await callerFor(t.tenant.id, teacher.id);
    await expect(caller.users.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.roles.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.audit.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("الدور الحساس دون مصادقة ثنائية مفعّلة يُمنع من كل شيء عدا إعدادها", async () => {
    const t = await makeTenant();
    const accountant = await makeUser(t, "ACCOUNTANT", { twoFactor: false });
    const { caller, session } = await callerFor(t.tenant.id, accountant.id);
    expect(session.requires2faSetup).toBe(true);
    await expect(caller.workspace.sidebar()).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("المصادقة الثنائية") });
  });

  it("المالك يصل، ويرى مستخدمي مدرسته فقط", async () => {
    const t = await makeTenant();
    const other = await makeTenant();
    const owner = await makeUser(t, "OWNER", { name: "مالك أ" });
    await makeUser(other, "OWNER", { name: "مالك ب" });
    const { caller } = await callerFor(t.tenant.id, owner.id);
    const users = await caller.users.list({});
    expect(users.map((u) => u.name)).toEqual(["مالك أ"]);
  });

  it("المدقق يقرأ سجل التدقيق لكن لا يعدّل الأدوار", async () => {
    const t = await makeTenant();
    const auditor = await makeUser(t, "AUDITOR");
    const { caller } = await callerFor(t.tenant.id, auditor.id);
    await expect(caller.audit.list({})).resolves.toHaveProperty("items");
    await expect(caller.roles.create({ name: "دور جديد" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("مساحات الفرق: المعلم يرى الأكاديمية فقط ولا يرى المالية", async () => {
    const t = await makeTenant();
    const teacher = await makeUser(t, "TEACHER");
    await rootDb.teamspaceMember.create({ data: { tenantId: t.tenant.id, teamspaceId: t.teamspaces["academic"]!, userId: teacher.id, level: "EDIT" } });
    const { caller } = await callerFor(t.tenant.id, teacher.id);
    const sidebar = await caller.workspace.sidebar();
    const keys = sidebar.teamspaces.map((ts) => ts.key);
    expect(keys).toContain("academic");
    expect(keys).not.toContain("finance");
  });

  it("الصفحة الخاصة لا يراها غير مالكها، ويُسجَّل إنشاؤها", async () => {
    const t = await makeTenant();
    const principal = await makeUser(t, "PRINCIPAL");
    const teacher = await makeUser(t, "TEACHER");
    const p = await callerFor(t.tenant.id, principal.id);
    const page = await p.caller.page.create({ title: "ملاحظات سرية" });
    const q = await callerFor(t.tenant.id, teacher.id);
    await expect(q.caller.page.get({ pageId: page.id })).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN|NOT_FOUND/) });
    const log = await rootDb.auditLog.findFirst({ where: { tenantId: t.tenant.id, entityType: "Page", entityId: page.id, action: "CREATE" } });
    expect(log?.userId).toBe(principal.id);
    expect(log?.ip).toBe("10.0.0.7");
  });
});
