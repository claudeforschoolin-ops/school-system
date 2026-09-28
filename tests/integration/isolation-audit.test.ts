import { describe, expect, it } from "vitest";
import { rootDb } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";
import { makeTenant, uid } from "./helpers";

describe("عزل المستأجرين على قاعدة حقيقية", () => {
  it("لا يرى مستأجر بيانات غيره ولا يعدّلها ولا يحذفها", async () => {
    const a = await makeTenant("مدرسة أ");
    const b = await makeTenant("مدرسة ب");
    const dbA = createTenantDb({ tenantId: a.tenant.id, actor: null });
    const dbB = createTenantDb({ tenantId: b.tenant.id, actor: null });

    const branchB = await dbB.branch.create({ data: { tenantId: b.tenant.id, code: `B-${uid()}`, name: "فرع ب السري" } });
    await dbA.branch.create({ data: { tenantId: a.tenant.id, code: `A-${uid()}`, name: "فرع أ" } });

    const visibleToA = await dbA.branch.findMany();
    expect(visibleToA.map((x) => x.name)).toEqual(["فرع أ"]);
    expect(await dbA.branch.findUnique({ where: { id: branchB.id } })).toBeNull();
    expect(await dbA.branch.count({ where: { id: branchB.id } })).toBe(0);
    expect((await dbA.branch.updateMany({ where: { id: branchB.id }, data: { name: "مخترق" } })).count).toBe(0);
    await expect(dbA.branch.update({ where: { id: branchB.id }, data: { name: "مخترق" } })).rejects.toThrow();
    expect((await dbA.branch.deleteMany({ where: { id: branchB.id } })).count).toBe(0);
    await expect(dbA.branch.create({ data: { tenantId: b.tenant.id, code: "X", name: "حقن" } })).rejects.toThrow();

    const still = await rootDb.branch.findUniqueOrThrow({ where: { id: branchB.id } });
    expect(still.name).toBe("فرع ب السري");
    // المستخدمون والأدوار كذلك
    expect((await dbA.role.findMany()).every((r) => r.tenantId === a.tenant.id)).toBe(true);
  });
});

describe("التدقيق التلقائي وحماية السجل", () => {
  it("كل إنشاء وتعديل وحذف يُسجَّل بالمستخدم وIP والقيم قبل/بعد", async () => {
    const t = await makeTenant();
    const actor = await rootDb.user.create({ data: { tenantId: t.tenant.id, email: `actor-${uid()}@t.sa`, name: "منفّذ الاختبار" } });
    const db = createTenantDb({ tenantId: t.tenant.id, actor: { id: actor.id, name: actor.name }, ip: "10.1.2.3", userAgent: "vitest" });

    const branch = await db.branch.create({ data: { tenantId: t.tenant.id, code: `C-${uid()}`, name: "الفرع الشمالي" } });
    await db.branch.update({ where: { id: branch.id }, data: { name: "الفرع الشمالي — بنات" } });
    await db.branch.delete({ where: { id: branch.id } });

    const logs = await rootDb.auditLog.findMany({ where: { tenantId: t.tenant.id, entityId: branch.id }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
    for (const l of logs) {
      expect(l.userId).toBe(actor.id);
      expect(l.userName).toBe("منفّذ الاختبار");
      expect(l.ip).toBe("10.1.2.3");
      expect(l.entityType).toBe("Branch");
    }
    expect(logs[1]!.oldValue).toEqual({ name: "الفرع الشمالي" });
    expect(logs[1]!.newValue).toEqual({ name: "الفرع الشمالي — بنات" });
    expect(logs[2]!.oldValue).toMatchObject({ name: "الفرع الشمالي — بنات" });
  });

  it("سجل التدقيق غير قابل للتعديل أو الحذف أو التفريغ حتى بالعميل الجذري", async () => {
    const t = await makeTenant();
    const entry = await rootDb.auditLog.create({ data: { tenantId: t.tenant.id, action: "CREATE", entityType: "Test", summary: "قيد أصلي" } });
    await expect(rootDb.auditLog.update({ where: { id: entry.id }, data: { summary: "مزوّر" } })).rejects.toThrow();
    await expect(rootDb.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow();
    await expect(rootDb.auditLog.deleteMany({ where: { tenantId: t.tenant.id } })).rejects.toThrow();
    await expect(rootDb.$executeRawUnsafe('TRUNCATE "AuditLog"')).rejects.toThrow();
    const again = await rootDb.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(again.summary).toBe("قيد أصلي");
  });
});
