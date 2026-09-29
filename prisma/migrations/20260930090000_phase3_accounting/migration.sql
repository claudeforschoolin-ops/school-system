-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "BalanceSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('MANUAL', 'OPENING', 'INVOICE', 'CREDIT_NOTE', 'RECEIPT', 'RECEIPT_VOID', 'CREDIT_APPLICATION', 'REFUND', 'PAYMENT_VOUCHER', 'REVENUE_RECOGNITION', 'CHEQUE', 'CASH_SESSION', 'BANK_TRANSFER', 'WRITE_OFF', 'CLOSING', 'REVERSAL');

-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('TUITION', 'REGISTRATION', 'TRANSPORT', 'ACTIVITY', 'BOOKS', 'UNIFORM', 'MEALS', 'LATE_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('SIBLING', 'STAFF', 'MERIT', 'SCHOLARSHIP', 'EARLY_PAYMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'SADAD');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "normalSide" "BalanceSide" NOT NULL,
    "parentId" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" TEXT,
    "cashFlowGroup" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "branchId" TEXT,
    "stageId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closingEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "periodId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" "JournalSource" NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reference" TEXT,
    "academicYearId" TEXT,
    "totalMinor" BIGINT NOT NULL,
    "reversalOfId" TEXT,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "postedInClosedPeriod" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitMinor" BIGINT NOT NULL DEFAULT 0,
    "creditMinor" BIGINT NOT NULL DEFAULT 0,
    "costCenterId" TEXT,
    "studentId" TEXT,
    "guardianId" TEXT,
    "description" TEXT,
    "statementLineId" TEXT,
    "reconciledAt" TIMESTAMP(3),

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "outputAccountId" TEXT,
    "inputAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FeeKind" NOT NULL,
    "revenueAccountId" TEXT NOT NULL,
    "receivableAccountId" TEXT NOT NULL,
    "deferred" BOOLEAN NOT NULL DEFAULT false,
    "taxCodeId" TEXT,
    "citizenTaxCodeId" TEXT,
    "refundable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "FeeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT,
    "stageId" TEXT,
    "gradeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "FeeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeScheduleLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "feeItemId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FeeScheduleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "lateFeeKind" TEXT NOT NULL DEFAULT 'NONE',
    "lateFeeValue" INTEGER NOT NULL DEFAULT 0,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "academicYearId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DiscountKind" NOT NULL,
    "method" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "siblingTiers" JSONB,
    "feeItemIds" TEXT[],
    "validFrom" DATE,
    "validTo" DATE,
    "approvalLimitMinor" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentDiscount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "discountTypeId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "valueOverride" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "approvalRequestId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "count" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT,
    "branchId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "issueDate" DATE,
    "dueDate" DATE NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "creditedMinor" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "batchId" TEXT,
    "installmentPlanId" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "remindersPaused" BOOLEAN NOT NULL DEFAULT false,
    "reminderLevel" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "feeItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "taxRateBp" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "revenueAccountId" TEXT NOT NULL,
    "receivableAccountId" TEXT NOT NULL,
    "deferred" BOOLEAN NOT NULL DEFAULT false,
    "recognizedMinor" INTEGER NOT NULL DEFAULT 0,
    "serviceStart" DATE,
    "serviceEnd" DATE,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceInstallment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "lateFeeInvoiceId" TEXT,

    CONSTRAINT "InvoiceInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "guardianId" TEXT,
    "studentId" TEXT,
    "payerName" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "unappliedMinor" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT,
    "bankAccountId" TEXT,
    "chequeNumber" TEXT,
    "chequeBank" TEXT,
    "chequeDate" DATE,
    "chequeStatus" TEXT,
    "chequeUpdatedAt" TIMESTAMP(3),
    "cashSessionId" TEXT,
    "branchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "voidReason" TEXT,
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receiptId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "installmentId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'RECEIPT',
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianCredit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "studentId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "guardianId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "bankAccountId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalRequestId" TEXT,
    "journalEntryId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentVoucher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "payee" TEXT NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "bankAccountId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "taxCodeId" TEXT,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalRequestId" TEXT,
    "journalEntryId" TEXT,
    "paidAt" TIMESTAMP(3),
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "branchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "importBatch" TEXT NOT NULL,
    "matchedAt" TIMESTAMP(3),
    "matchedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "branchId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingFloatMinor" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "expectedMinor" INTEGER,
    "countedMinor" INTEGER,
    "differenceMinor" INTEGER,
    "differenceEntryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_tenantId_parentId_idx" ON "Account"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_tenantId_code_key" ON "Account"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_tenantId_systemKey_key" ON "Account"("tenantId", "systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_tenantId_code_key" ON "CostCenter"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_tenantId_name_key" ON "FiscalYear"("tenantId", "name");

-- CreateIndex
CREATE INDEX "FiscalPeriod_tenantId_startDate_idx" ON "FiscalPeriod"("tenantId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalPeriod_fiscalYearId_startDate_key" ON "FiscalPeriod"("fiscalYearId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_date_idx" ON "JournalEntry"("tenantId", "date");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_sourceType_sourceId_idx" ON "JournalEntry"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_tenantId_number_key" ON "JournalEntry"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "JournalLine_statementLineId_key" ON "JournalLine"("statementLineId");

-- CreateIndex
CREATE INDEX "JournalLine_tenantId_accountId_idx" ON "JournalLine"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalLine_tenantId_guardianId_idx" ON "JournalLine"("tenantId", "guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCode_tenantId_code_key" ON "TaxCode"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FeeItem_tenantId_code_key" ON "FeeItem"("tenantId", "code");

-- CreateIndex
CREATE INDEX "FeeSchedule_tenantId_academicYearId_idx" ON "FeeSchedule"("tenantId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeScheduleLine_scheduleId_feeItemId_key" ON "FeeScheduleLine"("scheduleId", "feeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountType_tenantId_code_key" ON "DiscountType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "StudentDiscount_tenantId_studentId_idx" ON "StudentDiscount"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceBatch_tenantId_number_key" ON "InvoiceBatch"("tenantId", "number");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_studentId_idx" ON "Invoice"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_guardianId_idx" ON "Invoice"("tenantId", "guardianId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_dueDate_idx" ON "Invoice"("tenantId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceInstallment_invoiceId_seq_key" ON "InvoiceInstallment"("invoiceId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_tenantId_number_key" ON "CreditNote"("tenantId", "number");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_guardianId_idx" ON "Receipt"("tenantId", "guardianId");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_date_idx" ON "Receipt"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_tenantId_number_key" ON "Receipt"("tenantId", "number");

-- CreateIndex
CREATE INDEX "ReceiptAllocation_tenantId_invoiceId_idx" ON "ReceiptAllocation"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "GuardianCredit_tenantId_guardianId_idx" ON "GuardianCredit"("tenantId", "guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_tenantId_number_key" ON "Refund"("tenantId", "number");

-- CreateIndex
CREATE INDEX "PaymentVoucher_tenantId_status_idx" ON "PaymentVoucher"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentVoucher_tenantId_number_key" ON "PaymentVoucher"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_accountId_key" ON "BankAccount"("accountId");

-- CreateIndex
CREATE INDEX "BankStatementLine_bankAccountId_date_idx" ON "BankStatementLine"("bankAccountId", "date");

-- CreateIndex
CREATE INDEX "CashSession_tenantId_cashierId_status_idx" ON "CashSession"("tenantId", "cashierId", "status");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalPeriod" ADD CONSTRAINT "FiscalPeriod_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FiscalPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeScheduleLine" ADD CONSTRAINT "FeeScheduleLine_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "FeeSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceInstallment" ADD CONSTRAINT "InvoiceInstallment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- سلامة القيود المحاسبية (لا تعتمد على طبقة التطبيق)
-- =====================================================================

-- كل سطر إما مدين أو دائن بقيمة موجبة
ALTER TABLE "JournalLine" ADD CONSTRAINT "journal_line_one_side" CHECK ("debitMinor" >= 0 AND "creditMinor" >= 0 AND (("debitMinor" = 0) <> ("creditMinor" = 0)));

-- التوازن: يُفحص عند نهاية المعاملة (مؤجل) لكل قيد جديد أو سطر
CREATE OR REPLACE FUNCTION manassa_check_entry_balance() RETURNS trigger AS $$
DECLARE
  eid text;
  d numeric;
  c numeric;
  n int;
  total numeric;
BEGIN
  IF TG_TABLE_NAME = 'JournalEntry' THEN eid := NEW.id; ELSE eid := NEW."entryId"; END IF;
  SELECT COALESCE(SUM("debitMinor"), 0), COALESCE(SUM("creditMinor"), 0), COUNT(*) INTO d, c, n FROM "JournalLine" WHERE "entryId" = eid;
  IF n < 2 THEN
    RAISE EXCEPTION 'القيد يجب أن يحتوي سطرين على الأقل' USING ERRCODE = 'check_violation';
  END IF;
  IF d <> c THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين % لا يساوي الدائن %', d, c USING ERRCODE = 'check_violation';
  END IF;
  SELECT "totalMinor" INTO total FROM "JournalEntry" WHERE id = eid;
  IF total <> d THEN
    RAISE EXCEPTION 'إجمالي القيد لا يطابق مجموع سطوره' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_entry_balanced AFTER INSERT ON "JournalEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION manassa_check_entry_balance();
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT OR UPDATE ON "JournalLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION manassa_check_entry_balance();

-- لا تعديل ولا حذف بعد الترحيل (يُسمح فقط بحقول المطابقة البنكية وعلامة العكس)
CREATE OR REPLACE FUNCTION manassa_protect_journal() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'لا يُحذف القيد المرحّل؛ استخدم قيداً عكسياً' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_TABLE_NAME = 'JournalLine' THEN
    IF NEW."entryId" IS DISTINCT FROM OLD."entryId" OR NEW."accountId" IS DISTINCT FROM OLD."accountId" OR NEW."debitMinor" <> OLD."debitMinor" OR NEW."creditMinor" <> OLD."creditMinor" OR NEW."tenantId" <> OLD."tenantId" THEN
      RAISE EXCEPTION 'لا تُعدَّل سطور القيد المرحّل؛ استخدم قيداً عكسياً' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW."number" <> OLD."number" OR NEW."date" <> OLD."date" OR NEW."totalMinor" <> OLD."totalMinor" OR NEW."periodId" <> OLD."periodId" OR NEW."tenantId" <> OLD."tenantId" OR NEW."source" <> OLD."source" THEN
      RAISE EXCEPTION 'لا يُعدَّل القيد المرحّل؛ استخدم قيداً عكسياً' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_immutable BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION manassa_protect_journal();
CREATE TRIGGER journal_line_immutable BEFORE UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION manassa_protect_journal();

CREATE OR REPLACE FUNCTION manassa_forbid_journal_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'لا يُفرَّغ دفتر اليومية' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER journal_entry_no_truncate BEFORE TRUNCATE ON "JournalEntry" FOR EACH STATEMENT EXECUTE FUNCTION manassa_forbid_journal_truncate();
CREATE TRIGGER journal_line_no_truncate BEFORE TRUNCATE ON "JournalLine" FOR EACH STATEMENT EXECUTE FUNCTION manassa_forbid_journal_truncate();

-- الفترة: التاريخ داخلها، ولا ترحيل في فترة مقفلة إلا بتفعيل استثناء صريح داخل المعاملة
CREATE OR REPLACE FUNCTION manassa_check_period() RETURNS trigger AS $$
DECLARE
  p RECORD;
BEGIN
  SELECT status, "startDate", "endDate", "tenantId" INTO p FROM "FiscalPeriod" WHERE id = NEW."periodId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الفترة المحاسبية غير موجودة' USING ERRCODE = 'check_violation';
  END IF;
  IF p."tenantId" <> NEW."tenantId" THEN
    RAISE EXCEPTION 'الفترة المحاسبية لمدرسة أخرى' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."date" < p."startDate" OR NEW."date" > p."endDate" THEN
    RAISE EXCEPTION 'تاريخ القيد خارج الفترة المحاسبية' USING ERRCODE = 'check_violation';
  END IF;
  IF p.status = 'CLOSED' AND COALESCE(current_setting('manassa.allow_closed_period', true), '') <> 'on' THEN
    RAISE EXCEPTION 'الفترة المحاسبية مقفلة؛ لا ترحيل فيها' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER journal_entry_period BEFORE INSERT ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION manassa_check_period();

-- السطر: الحساب من المدرسة نفسها وليس حساباً تجميعياً
CREATE OR REPLACE FUNCTION manassa_check_line_account() RETURNS trigger AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT "tenantId", "isGroup" INTO a FROM "Account" WHERE id = NEW."accountId";
  IF a."tenantId" <> NEW."tenantId" THEN
    RAISE EXCEPTION 'الحساب لمدرسة أخرى' USING ERRCODE = 'check_violation';
  END IF;
  IF a."isGroup" THEN
    RAISE EXCEPTION 'لا يُرحَّل على حساب تجميعي' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER journal_line_account BEFORE INSERT ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION manassa_check_line_account();
