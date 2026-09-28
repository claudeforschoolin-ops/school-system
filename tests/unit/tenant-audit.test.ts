import { describe, expect, it } from "vitest";
import { diffRecords, redact } from "@/server/db/audit-utils";
import { scopeArgs } from "@/server/db/tenant";

describe("عزل المستأجرين في وسائط الاستعلام", () => {
  it("يضيف tenantId لكل قراءة وتعديل وحذف", () => {
    expect(scopeArgs("Page", "findMany", { where: { title: "x" } }, "T1")).toEqual({ where: { title: "x", tenantId: "T1" } });
    expect(scopeArgs("Page", "findUnique", { where: { id: "p" } }, "T1").where).toEqual({ id: "p", tenantId: "T1" });
    expect(scopeArgs("Page", "updateMany", { where: {}, data: { title: "y" } }, "T1").where).toEqual({ tenantId: "T1" });
    expect(scopeArgs("Page", "delete", { where: { id: "p" } }, "T1").where).toEqual({ id: "p", tenantId: "T1" });
    expect(scopeArgs("Page", "count", undefined, "T1").where).toEqual({ tenantId: "T1" });
  });

  it("يفرض tenantId عند الإنشاء ويرفض مستأجراً آخر", () => {
    expect(scopeArgs("Page", "create", { data: { title: "x" } }, "T1").data).toEqual({ title: "x", tenantId: "T1" });
    expect(() => scopeArgs("Page", "create", { data: { title: "x", tenantId: "T2" } }, "T1")).toThrow();
    expect(() => scopeArgs("Page", "createMany", { data: [{ title: "a" }, { title: "b", tenantId: "T2" }] }, "T1")).toThrow();
  });

  it("يمنع نقل سجل إلى مستأجر آخر بالتعديل", () => {
    expect(() => scopeArgs("Page", "update", { where: { id: "p" }, data: { tenantId: "T2" } }, "T1")).toThrow();
    expect(() => scopeArgs("Page", "upsert", { where: { id: "p" }, create: {}, update: { tenantId: "T2" } }, "T1")).toThrow();
  });

  it("المستأجر نفسه: قراءة سجله فقط، ولا إنشاء ولا حذف", () => {
    expect(scopeArgs("Tenant", "findFirst", {}, "T1").where).toEqual({ id: "T1" });
    expect(() => scopeArgs("Tenant", "create", { data: {} }, "T1")).toThrow();
    expect(() => scopeArgs("Tenant", "delete", { where: { id: "T1" } }, "T1")).toThrow();
  });
});

describe("سجل التدقيق: الحجب والفروقات", () => {
  it("يحجب الأسرار ويلخّص المحتوى الكبير", () => {
    const r = redact({ email: "a@b.sa", passwordHash: "$2b$...", twoFactorSecret: "ABC", tokenHash: null, content: { type: "doc", content: [] } })!;
    expect(r.email).toBe("a@b.sa");
    expect(r.passwordHash).toBe("[محجوب]");
    expect(r.twoFactorSecret).toBe("[محجوب]");
    expect(r.tokenHash).toBeNull();
    expect(r.content).toMatchObject({ __summary: expect.stringContaining("محتوى") });
  });

  it("الفروقات تحوي الحقول المتغيرة فقط وتتجاهل الحقول التقنية", () => {
    const d = diffRecords({ title: "أ", status: "todo", updatedAt: new Date(1), position: 1 }, { title: "ب", status: "todo", updatedAt: new Date(2), position: 1 });
    expect(d.changed).toEqual(["title"]);
    expect(d.oldValue).toEqual({ title: "أ" });
    expect(d.newValue).toEqual({ title: "ب" });
  });

  it("الفروقات لا تسرّب كلمة المرور حتى عند تغيّرها", () => {
    const d = diffRecords({ passwordHash: "old" }, { passwordHash: "new" });
    expect(d.changed).toEqual(["passwordHash"]);
    expect(d.newValue.passwordHash).toBe("[محجوب]");
    expect(d.oldValue.passwordHash).toBe("[محجوب]");
  });
});
