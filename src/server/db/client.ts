/**
 * عميل Prisma الجذري (غير مقيّد بالمستأجر).
 * ⚠️ لا يُستخدم مباشرة في منطق الوحدات — استخدم createTenantDb من ./tenant
 * الاستخدامات المسموحة: المصادقة (البحث عن المستخدم قبل معرفة المستأجر)،
 * إنشاء المستأجرين، البذور، وكتابة سجل التدقيق.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __manassaPrisma?: PrismaClient };

function createRootClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL غير مضبوط");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

export const rootDb: PrismaClient = globalForPrisma.__manassaPrisma ?? createRootClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__manassaPrisma = rootDb;

export type RootDb = PrismaClient;
