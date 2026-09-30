/**
 * النسخ الاحتياطية: نسخة منطقية لكل بيانات المدرسة (كل جدول يحمل tenantId) في لقطة متسقة،
 * مضغوطة ومشفّرة AES-256-GCM، مع بصمة SHA-256 وسجل، وتحقق، واسترجاع إلى مدرسة جديدة، وتنزيل كامل.
 * ---------------------------------------------------------------------
 * - تُستثنى الجلسات ورموز الدخول (أسرار لا يُعاد استخدامها).
 * - الاسترجاع لا يطغى على المدرسة الحالية (سجل التدقيق غير قابل للحذف بطبيعته)؛ بل ينشئ مدرسة
 *   مستقلة بمعرّفات جديدة لكل السجلات مع الحفاظ على العلاقات، لمراجعتها أو اعتمادها بديلاً.
 * - أثناء الاسترجاع تُعطَّل مشغّلات المستخدم مؤقتاً داخل المعاملة نفسها (قيود القيود المقفلة
 *   والدرجات المعتمدة صُممت للعمل اليومي لا لإعادة البناء)، ثم تُعاد قبل الإتمام.
 */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import { rootDb } from "@/server/db/client";
import { writeAudit, type TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { storage } from "@/server/storage";
import { readModuleSettings } from "./module-settings.service";
import { nextNumber } from "./sequence.service";

const EXCLUDED = new Set(["Session", "AuthToken"]);
const MAGIC = Buffer.from("MNSB1");
type Row = Record<string, unknown>;
type Tx = Parameters<Parameters<typeof rootDb.$transaction>[0]>[0];

// ---------------------------------------------------------------------
// المفتاح والتشفير
// ---------------------------------------------------------------------

function backupKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY يجب أن يكون 32 بايت بترميز base64");
    return k;
  }
  const field = process.env.FIELD_ENCRYPTION_KEY;
  if (!field) throw new Error("لا مفتاح تشفير للنسخ الاحتياطية (BACKUP_ENCRYPTION_KEY أو FIELD_ENCRYPTION_KEY)");
  return Buffer.from(hkdfSync("sha256", Buffer.from(field, "base64"), Buffer.from("manassa"), Buffer.from("backup-v1"), 32));
}
export const keyId = () => createHash("sha256").update(backupKey()).digest("hex").slice(0, 16);

export function encryptBackup(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", backupKey(), iv);
  const enc = Buffer.concat([c.update(gzipSync(plain)), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]);
}

export function decryptBackup(file: Buffer): Buffer {
  if (!file.subarray(0, 5).equals(MAGIC)) throw new Error("ليس ملف نسخة احتياطية من المنصة");
  const iv = file.subarray(5, 17);
  const tag = file.subarray(17, 33);
  const d = createDecipheriv("aes-256-gcm", backupKey(), iv);
  d.setAuthTag(tag);
  return gunzipSync(Buffer.concat([d.update(file.subarray(33)), d.final()]));
}

// ---------------------------------------------------------------------
// بنية الجداول من قاعدة البيانات نفسها
// ---------------------------------------------------------------------

export async function tenantTables(): Promise<string[]> {
  const rows = await rootDb.$queryRaw<Array<{ table_name: string }>>`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name`;
  return rows.map((r) => r.table_name).filter((t) => !EXCLUDED.has(t));
}

interface Fk {
  child: string;
  parent: string;
  column: string;
  notNull: boolean;
}

async function foreignKeys(): Promise<Fk[]> {
  const rows = await rootDb.$queryRaw<Array<{ child: string; parent: string; col: string; notnull: boolean }>>`
    SELECT cl.relname AS child, pl.relname AS parent, a.attname AS col, a.attnotnull AS notnull
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_class pl ON pl.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`;
  return rows.map((r) => ({ child: r.child, parent: r.parent, column: r.col, notNull: r.notnull }));
}

/** ترتيب الإدراج: الآباء قبل الأبناء؛ الحلقات تُكسر بعمود اختياري يُملأ لاحقاً بتحديث */
export function insertionPlan(tables: string[], fks: Fk[]) {
  const set = new Set(tables);
  const edges = fks.filter((f) => set.has(f.child) && set.has(f.parent) && f.child !== f.parent);
  const deferred: Fk[] = [];
  const order: string[] = [];
  const remaining = new Set(tables);
  let active = [...edges];
  while (remaining.size) {
    const ready = [...remaining].filter((t) => !active.some((e) => e.child === t && remaining.has(e.parent)));
    if (ready.length) {
      ready.sort();
      for (const t of ready) {
        order.push(t);
        remaining.delete(t);
      }
      continue;
    }
    // حلقة: أجّل عموداً اختيارياً في أحد جداولها
    const breakable = active.find((e) => remaining.has(e.child) && remaining.has(e.parent) && !e.notNull);
    if (!breakable) throw new Error(`تعذر ترتيب الجداول (حلقة إلزامية عند ${[...remaining].join("، ")})`);
    deferred.push(breakable);
    active = active.filter((e) => e !== breakable);
  }
  const selfRefs = fks.filter((f) => set.has(f.child) && f.child === f.parent);
  return { order, deferred, selfRefs };
}

// ---------------------------------------------------------------------
// إنشاء النسخة
// ---------------------------------------------------------------------

function requireBackups(session: SessionData, action: "view" | "create" | "export") {
  if (!resolveScope(session.access, "backups", action)) throw forbidden("ليست لديك صلاحية النسخ الاحتياطية");
}

export async function createBackup(tenantId: string, kind: "AUTO" | "MANUAL", actor?: { id: string; name: string } | null) {
  const db = { tenantId };
  const number = await rootDb.$transaction((tx) => nextNumber(tx as unknown as TenantDb, tenantId, "backup"));
  const run = await rootDb.backupRun.create({ data: { tenantId: db.tenantId, number, kind, createdById: actor?.id ?? null } });
  const started = Date.now();
  try {
    const tables = await tenantTables();
    const payload: { format: string; version: number; createdAt: string; tenant: Row; tables: Record<string, Row[]> } = { format: "manassa-backup", version: 1, createdAt: new Date().toISOString(), tenant: {}, tables: {} };
    let rows = 0;
    // لقطة متسقة: كل القراءات في معاملة واحدة بعزل «قراءة قابلة للتكرار»
    await rootDb.$transaction(
      async (tx) => {
        const t = await tx.$queryRawUnsafe<Array<{ j: Row }>>(`SELECT row_to_json(t) AS j FROM "Tenant" t WHERE id = $1`, tenantId);
        payload.tenant = t[0]!.j;
        for (const table of tables) {
          const r = await tx.$queryRawUnsafe<Array<{ j: Row }>>(`SELECT row_to_json(t) AS j FROM "${table}" t WHERE "tenantId" = $1 AND t.id <> $2`, tenantId, run.id);
          payload.tables[table] = r.map((x) => x.j);
          rows += r.length;
        }
      },
      { isolationLevel: "RepeatableRead", timeout: 600_000, maxWait: 30_000 },
    );
    const plain = Buffer.from(JSON.stringify(payload), "utf8");
    const checksum = createHash("sha256").update(plain).digest("hex");
    const file = encryptBackup(plain);
    const key = `${tenantId}/backups/${String(number).padStart(5, "0")}-${Date.now()}.mnsb`;
    await storage().put(key, file, "application/octet-stream");
    const retention = readModuleSettings((payload.tenant.settings ?? {}) as Record<string, unknown>, "backups").retentionDays;
    const done = await rootDb.backupRun.update({ where: { id: run.id }, data: { status: "SUCCESS", storageKey: key, sizeBytes: file.length, tables: tables.length, rows, checksum, keyId: keyId(), durationMs: Date.now() - started, expiresAt: new Date(Date.now() + retention * 86_400_000) } });
    await writeAudit({ tenantId, actor: actor ?? null }, { action: "BACKUP", entityType: "BackupRun", entityId: run.id, summary: `نسخة احتياطية ${kind === "AUTO" ? "تلقائية" : "يدوية"} #${number}: ${rows} سجلاً في ${tables.length} جدولاً (${Math.round(file.length / 1024)} ك.ب)` });
    return done;
  } catch (e) {
    return rootDb.backupRun.update({ where: { id: run.id }, data: { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "خطأ", durationMs: Date.now() - started } });
  }
}

async function readBackup(tenantId: string, id: string) {
  const run = await rootDb.backupRun.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!run || run.status !== "SUCCESS" || !run.storageKey) throw notFound("النسخة غير متاحة");
  const plain = decryptBackup(await storage().get(run.storageKey));
  const checksum = createHash("sha256").update(plain).digest("hex");
  if (checksum !== run.checksum) throw badRequest("بصمة النسخة لا تطابق المسجلة — الملف تالف أو معدّل");
  const payload = JSON.parse(plain.toString("utf8")) as { format: string; version: number; tenant: Row; tables: Record<string, Row[]> };
  if (payload.format !== "manassa-backup") throw badRequest("صيغة غير معروفة");
  return { run, payload, plain };
}

/** التحقق: فك التشفير ومطابقة البصمة وعدد السجلات */
export async function verifyBackup(db: TenantDb, session: SessionData, id: string) {
  requireBackups(session, "view");
  const { run, payload } = await readBackup(session.tenant.id, id);
  const rows = Object.values(payload.tables).reduce((s, r) => s + r.length, 0);
  if (rows !== run.rows) throw badRequest(`عدد السجلات ${rows} لا يطابق المسجل ${run.rows}`);
  await rootDb.backupRun.update({ where: { id }, data: { verifiedAt: new Date() } });
  return { ok: true, rows, tables: Object.keys(payload.tables).length };
}

// ---------------------------------------------------------------------
// الاسترجاع إلى مدرسة جديدة
// ---------------------------------------------------------------------

function newId() {
  return `c${Date.now().toString(36)}${randomBytes(10).toString("hex")}`.slice(0, 25);
}

/** يستبدل كل معرّف قديم بجديد في القيم (بما فيها داخل JSON وروابط الملفات) */
export function remapValue(v: unknown, map: Map<string, string>): unknown {
  if (typeof v === "string") {
    const m = map.get(v);
    if (m) return m;
    if (v.includes("/api/files/")) return v.replace(/\/api\/files\/([A-Za-z0-9_-]+)/g, (all, id: string) => (map.has(id) ? `/api/files/${map.get(id)}` : all));
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => remapValue(x, map));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remapValue(x, map)]));
  return v;
}

export async function restoreBackup(db: TenantDb, session: SessionData, input: { id: string; slug: string; name: string }) {
  requireBackups(session, "create");
  if (!session.roleKeys.includes("OWNER")) throw forbidden("الاسترجاع لمالك النظام");
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) throw badRequest("المعرّف: أحرف إنجليزية صغيرة وأرقام وشرطات (٣–٤٠)");
  if (await rootDb.tenant.findUnique({ where: { slug } })) throw badRequest("المعرّف مستخدم");
  const { run, payload } = await readBackup(session.tenant.id, input.id);
  const newTenantId = newId();
  const oldTenantId = String(payload.tenant.id);
  const map = new Map<string, string>([[oldTenantId, newTenantId]]);
  for (const rows of Object.values(payload.tables)) for (const r of rows) if (typeof r.id === "string") map.set(r.id, newId());
  const [tables, fks] = await Promise.all([tenantTables(), foreignKeys()]);
  const present = tables.filter((t) => payload.tables[t]?.length);
  const plan = insertionPlan(present, fks);
  const deferredCols = new Map<string, string[]>();
  for (const d of plan.deferred) deferredCols.set(d.child, [...(deferredCols.get(d.child) ?? []), d.column]);
  const triggerTables = (await rootDb.$queryRaw<Array<{ t: string }>>`SELECT DISTINCT event_object_table AS t FROM information_schema.triggers WHERE event_object_schema = 'public'`).map((r) => r.t).filter((t) => present.includes(t));
  const fileCopies: Array<[string, string]> = [];
  let inserted = 0;
  try {
    await rootDb.$transaction(
      async (tx: Tx) => {
        for (const t of triggerTables) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
        const tenantRow = remapValue(payload.tenant, map) as Row;
        await tx.$executeRawUnsafe(`INSERT INTO "Tenant" SELECT * FROM json_populate_record(NULL::"Tenant", $1::json)`, JSON.stringify({ ...tenantRow, id: newTenantId, slug, name: input.name.trim() || `${String(tenantRow.name)} (نسخة مستعادة)`, isDemo: tenantRow.isDemo, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
        const later: Array<{ table: string; id: string; set: Row }> = [];
        for (const table of plan.order) {
          let rows = (payload.tables[table] ?? []).map((r) => remapValue(r, map) as Row);
          if (table === "FileObject") {
            rows = rows.map((r) => {
              const key = String(r.storageKey).replace(oldTenantId, newTenantId);
              if (key !== r.storageKey) fileCopies.push([String(r.storageKey), key]);
              return { ...r, storageKey: key === r.storageKey ? `${newTenantId}/${key}` : key };
            });
          }
          if (table === "EDocument" || table === "ReportCard") rows = rows.map((r) => ({ ...r, verifyCode: randomBytes(9).toString("base64url") }));
          const deferCols = deferredCols.get(table) ?? [];
          if (deferCols.length) {
            rows = rows.map((r) => {
              const set: Row = {};
              for (const c of deferCols) if (r[c] !== null && r[c] !== undefined) set[c] = r[c];
              if (Object.keys(set).length) later.push({ table, id: String(r.id), set });
              return { ...r, ...Object.fromEntries(deferCols.map((c) => [c, null])) };
            });
          }
          // المراجع الذاتية (شجرة الحسابات، الصفحات…): الآباء أولاً
          const self = plan.selfRefs.filter((s) => s.child === table).map((s) => s.column);
          if (self.length) rows = orderSelf(rows, self);
          for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            await tx.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`, JSON.stringify(chunk));
          }
          inserted += rows.length;
        }
        for (const l of later) {
          const cols = Object.keys(l.set);
          await tx.$executeRawUnsafe(`UPDATE "${l.table}" t SET ${cols.map((c) => `"${c}" = s."${c}"`).join(", ")} FROM json_populate_record(NULL::"${l.table}", $1::json) s WHERE t.id = $2`, JSON.stringify(l.set), l.id);
        }
        for (const t of triggerTables) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`);
      },
      { timeout: 900_000, maxWait: 60_000 },
    );
    for (const [from, to] of fileCopies) {
      const data = await storage().get(from).catch(() => null);
      if (data) await storage().put(to, data, "application/octet-stream");
    }
    await rootDb.restoreRun.create({ data: { tenantId: session.tenant.id, backupId: run.id, targetTenantId: newTenantId, targetSlug: slug, status: "SUCCESS", rows: inserted, createdById: session.user.id } });
    await writeAudit({ tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } }, { action: "RESTORE", entityType: "BackupRun", entityId: run.id, summary: `استرجاع النسخة #${run.number} إلى مدرسة جديدة «${slug}» (${inserted} سجلاً)` });
    return { ok: true, tenantId: newTenantId, slug, rows: inserted };
  } catch (e) {
    await rootDb.restoreRun.create({ data: { tenantId: session.tenant.id, backupId: run.id, targetSlug: slug, status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "خطأ", createdById: session.user.id } });
    throw badRequest(`تعذر الاسترجاع: ${e instanceof Error ? e.message.slice(0, 200) : ""}`);
  }
}

function orderSelf(rows: Row[], cols: string[]): Row[] {
  const ids = new Set(rows.map((r) => String(r.id)));
  const done = new Set<string>();
  const out: Row[] = [];
  let pending = rows;
  while (pending.length) {
    const next: Row[] = [];
    for (const r of pending) {
      const ok = cols.every((c) => r[c] === null || r[c] === undefined || !ids.has(String(r[c])) || done.has(String(r[c])));
      if (ok) {
        out.push(r);
        done.add(String(r.id));
      } else next.push(r);
    }
    if (next.length === pending.length) return [...out, ...next];
    pending = next;
  }
  return out;
}

// ---------------------------------------------------------------------
// القائمة والتنزيل والمهمة الدورية
// ---------------------------------------------------------------------

export async function listBackups(db: TenantDb, session: SessionData) {
  requireBackups(session, "view");
  const [runs, restores] = await Promise.all([rootDb.backupRun.findMany({ where: { tenantId: session.tenant.id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 60 }), rootDb.restoreRun.findMany({ where: { tenantId: session.tenant.id }, orderBy: { createdAt: "desc" }, take: 20 })]);
  const users = await db.user.findMany({ where: { id: { in: [...runs.map((r) => r.createdById ?? ""), ...restores.map((r) => r.createdById ?? "")] } }, select: { id: true, name: true } });
  const settings = readModuleSettings(session.tenant.settings, "backups");
  let keyOk = true;
  try {
    keyId();
  } catch {
    keyOk = false;
  }
  return {
    runs: runs.map((r) => ({ ...r, by: users.find((u) => u.id === r.createdById)?.name ?? (r.kind === "AUTO" ? "المهمة التلقائية" : null) })),
    restores: restores.map((r) => ({ ...r, by: users.find((u) => u.id === r.createdById)?.name ?? null })),
    settings,
    keyOk,
    dedicatedKey: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
    canCreate: Boolean(resolveScope(session.access, "backups", "create")),
    canExport: Boolean(resolveScope(session.access, "backups", "export")),
    canRestore: session.roleKeys.includes("OWNER"),
  };
}

export async function backupNow(db: TenantDb, session: SessionData) {
  requireBackups(session, "create");
  const running = await rootDb.backupRun.findFirst({ where: { tenantId: session.tenant.id, status: "RUNNING", createdAt: { gte: new Date(Date.now() - 30 * 60_000) } } });
  if (running) throw badRequest("نسخة قيد الإنشاء حالياً");
  return createBackup(session.tenant.id, "MANUAL", { id: session.user.id, name: session.user.name });
}

/** التنزيل الكامل (JSON مضغوط غير مشفّر) — يحتاج صلاحية التصدير وتحققاً بخطوتين في الجلسة */
export async function downloadBackup(session: SessionData, id: string) {
  requireBackups(session, "export");
  if (!session.user.twoFactorEnabled || !session.twoFactorVerified) throw forbidden("تنزيل البيانات الكاملة يتطلب تفعيل التحقق بخطوتين");
  const { run, plain } = await readBackup(session.tenant.id, id);
  await writeAudit({ tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } }, { action: "EXPORT", entityType: "BackupRun", entityId: run.id, summary: `تنزيل البيانات الكاملة من النسخة #${run.number}` });
  return { buffer: gzipSync(plain), filename: `${session.tenant.slug}-backup-${String(run.number).padStart(5, "0")}.json.gz` };
}

/** المهمة الدورية: نسخة يومية في الساعة المحددة، وحذف المنتهية مدتها */
export async function runScheduledBackup(tenantId: string, now = new Date()) {
  const tenant = await rootDb.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true, timezone: true } });
  const s = readModuleSettings(tenant.settings, "backups");
  const expired = await rootDb.backupRun.findMany({ where: { tenantId, deletedAt: null, expiresAt: { lt: now } } });
  for (const e of expired) {
    if (e.storageKey) await storage().remove(e.storageKey).catch(() => undefined);
    await rootDb.backupRun.update({ where: { id: e.id }, data: { deletedAt: now } });
  }
  if (!s.enabled) return { skipped: "النسخ التلقائي متوقف", expired: expired.length };
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tenant.timezone }).format(now)) % 24;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tenant.timezone }).format(now);
  const last = await rootDb.backupRun.findFirst({ where: { tenantId, kind: "AUTO", status: "SUCCESS" }, orderBy: { createdAt: "desc" } });
  const lastDay = last ? new Intl.DateTimeFormat("en-CA", { timeZone: tenant.timezone }).format(last.createdAt) : null;
  if (hour < s.hour || lastDay === today) return { skipped: "ليس موعدها", expired: expired.length };
  const run = await createBackup(tenantId, "AUTO", null);
  return { number: run.number, status: run.status, expired: expired.length };
}
