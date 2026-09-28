import { describe, expect, it } from "vitest";
import { can, flattenPermissions, hasBroadScope, MATCH_NOTHING, resolveScope, scopeWhere, type AccessProfile } from "@/lib/rbac/access";
import { MODULE_GROUPS } from "@/lib/rbac/catalog";
import { SYSTEM_ROLES } from "@/lib/rbac/defaults";

const profile = (assignments: AccessProfile["assignments"]): AccessProfile => ({ userId: "u1", assignments });

describe("تقييم الصلاحيات", () => {
  it("لا صلاحية دون منح", () => {
    expect(resolveScope(profile([]), "students", "view")).toBeNull();
    expect(scopeWhere(null, { branchField: "branchId" }, "u1")).toEqual(MATCH_NOTHING);
  });

  it("ALL يغلب أي نطاق آخر", () => {
    const p = profile([
      { roleKey: "A", roleName: "A", branchId: "b1", stageId: null, grants: [{ module: "students", action: "view", scope: "BRANCH" }] },
      { roleKey: "B", roleName: "B", branchId: null, stageId: null, grants: [{ module: "students", action: "view", scope: "ALL" }] },
    ]);
    expect(resolveScope(p, "students", "view")).toEqual({ kind: "all" });
    expect(scopeWhere(resolveScope(p, "students", "view"), { branchField: "branchId" }, "u1")).toBeUndefined();
  });

  it("اتحاد نطاقات الفروع والمراحل", () => {
    const p = profile([
      { roleKey: "A", roleName: "A", branchId: "b1", stageId: null, grants: [{ module: "attendance", action: "view", scope: "BRANCH" }] },
      { roleKey: "B", roleName: "B", branchId: null, stageId: "s2", grants: [{ module: "attendance", action: "view", scope: "STAGE" }] },
    ]);
    const scope = resolveScope(p, "attendance", "view");
    expect(scope).toEqual({ kind: "limited", branchIds: ["b1"], stageIds: ["s2"], assigned: false, own: false });
    expect(scopeWhere(scope, { branchField: "branchId", stageField: "stageId" }, "u1")).toEqual({ OR: [{ branchId: { in: ["b1"] } }, { stageId: { in: ["s2"] } }] });
    expect(hasBroadScope(p, "attendance", "view")).toBe(true);
  });

  it("نطاق الفرع دون فرع محدد لا يمنح شيئاً (لا توسيع ضمني)", () => {
    const p = profile([{ roleKey: "A", roleName: "A", branchId: null, stageId: null, grants: [{ module: "students", action: "view", scope: "BRANCH" }] }]);
    expect(can(p, "students", "view")).toBe(false);
  });

  it("OWN يقيّد بالمالك فقط وليس نطاقاً واسعاً", () => {
    const p = profile([{ roleKey: "A", roleName: "A", branchId: null, stageId: null, grants: [{ module: "messages", action: "view", scope: "OWN" }] }]);
    expect(scopeWhere(resolveScope(p, "messages", "view"), { ownerField: "createdById" }, "u1")).toEqual({ createdById: "u1" });
    expect(hasBroadScope(p, "messages", "view")).toBe(false);
    // لا حقل مالك في الكيان ← لا شيء
    expect(scopeWhere(resolveScope(p, "messages", "view"), { branchField: "branchId" }, "u1")).toEqual(MATCH_NOTHING);
  });

  it("الإجراء منفصل عن غيره", () => {
    const p = profile([{ roleKey: "A", roleName: "A", branchId: null, stageId: null, grants: [{ module: "invoices", action: "view", scope: "ALL" }] }]);
    expect(can(p, "invoices", "view")).toBe(true);
    expect(can(p, "invoices", "delete")).toBe(false);
  });

  it("flattenPermissions يأخذ أوسع نطاق", () => {
    const p = profile([
      { roleKey: "A", roleName: "A", branchId: "b1", stageId: null, grants: [{ module: "x", action: "view", scope: "OWN" }] },
      { roleKey: "B", roleName: "B", branchId: "b1", stageId: null, grants: [{ module: "x", action: "view", scope: "BRANCH" }] },
    ]);
    expect(flattenPermissions(p)).toEqual({ "x:view": "BRANCH" });
  });
});

describe("الأدوار الافتراضية", () => {
  const modules = new Set(MODULE_GROUPS.flatMap((g) => g.modules.map((m) => m.key)));

  it("كل المنح تشير إلى وحدات موجودة في الكتالوج", () => {
    for (const role of SYSTEM_ROLES) for (const g of role.grants) expect(modules, `${role.key} → ${g.module}`).toContain(g.module);
  });

  it("المرحلة ٦ أُلغيت: لا بوابات ولا تطبيق أولياء أمور ولا واجهات عامة", () => {
    for (const key of ["parent_app", "website", "api", "teacher_portal"]) expect(modules.has(key)).toBe(false);
    expect(MODULE_GROUPS.flatMap((g) => g.modules).some((m) => m.phase === 6)).toBe(false);
  });

  it("المالك يملك كل شيء بنطاق كامل، والمدقق قراءة فقط", () => {
    const owner = SYSTEM_ROLES.find((r) => r.key === "OWNER")!;
    const auditor = SYSTEM_ROLES.find((r) => r.key === "AUDITOR")!;
    expect(owner.grants.every((g) => g.scope === "ALL")).toBe(true);
    expect(auditor.grants.every((g) => g.action === "view" || g.action === "export" || g.action === "print")).toBe(true);
  });
});
