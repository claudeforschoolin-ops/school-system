-- AlterTable
ALTER TABLE "CreditNote" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "creditedMinor" INTEGER NOT NULL DEFAULT 0;

