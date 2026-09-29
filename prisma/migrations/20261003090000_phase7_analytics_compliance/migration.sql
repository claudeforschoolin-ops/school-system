-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "amountMinor" INTEGER,
ADD COLUMN     "workflowVersion" INTEGER;

-- AlterTable
ALTER TABLE "ApprovalStep" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "escalateToRoleId" TEXT,
ADD COLUMN     "escalateToUserId" TEXT,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "branchKey" TEXT NOT NULL DEFAULT 'ALL',
    "value" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'COMPUTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataset" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "sharedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerId" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "schedule" JSONB,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "fileId" TEXT,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "runById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalWorkflow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "steps" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dataset" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '[]',
    "frequency" TEXT NOT NULL DEFAULT 'DAILY',
    "mode" TEXT NOT NULL DEFAULT 'EACH_ROW',
    "threshold" INTEGER NOT NULL DEFAULT 1,
    "cooldownDays" INTEGER NOT NULL DEFAULT 7,
    "actions" JSONB NOT NULL,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRuleRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "acted" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRuleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRuleHit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "lastHitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hits" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AutomationRuleHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "changes" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "requireAcceptance" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAcceptance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT 'STUDENT',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "consentTypeId" TEXT NOT NULL,
    "studentId" TEXT,
    "employeeId" TEXT,
    "givenById" TEXT,
    "givenByName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'PORTAL',
    "policyVersion" INTEGER,
    "note" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "retainDays" INTEGER NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'DELETE',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastAffected" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "affected" INTEGER NOT NULL,
    "cutoff" TIMESTAMP(3) NOT NULL,
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "requesterUserId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterContact" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "dueDate" DATE NOT NULL,
    "assigneeId" TEXT,
    "resolution" TEXT,
    "exportFileId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ACKNOWLEDGMENT',
    "body" TEXT NOT NULL,
    "contentHash" TEXT,
    "fileId" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "signingOrder" TEXT NOT NULL DEFAULT 'PARALLEL',
    "dueDate" DATE,
    "verifyCode" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EDocumentSigner" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "roleLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "signatureData" TEXT,
    "typedName" TEXT,
    "signatureHash" TEXT,
    "signedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "remindedAt" TIMESTAMP(3),

    CONSTRAINT "EDocumentSigner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'TECHNICAL',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "pageUrl" TEXT,
    "resolution" TEXT,
    "satisfaction" INTEGER,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketReply" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "views" INTEGER NOT NULL DEFAULT 0,
    "helpfulYes" INTEGER NOT NULL DEFAULT 0,
    "helpfulNo" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "tables" INTEGER NOT NULL DEFAULT 0,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "keyId" TEXT,
    "durationMs" INTEGER,
    "error" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestoreRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "targetTenantId" TEXT,
    "targetSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestoreRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetricSnapshot_tenantId_metric_period_idx" ON "MetricSnapshot"("tenantId", "metric", "period");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_tenantId_metric_period_branchKey_key" ON "MetricSnapshot"("tenantId", "metric", "period", "branchKey");

-- CreateIndex
CREATE INDEX "SavedReport_tenantId_ownerId_idx" ON "SavedReport"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "SavedReport_tenantId_scheduleEnabled_nextRunAt_idx" ON "SavedReport"("tenantId", "scheduleEnabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "ReportRun_tenantId_reportId_createdAt_idx" ON "ReportRun"("tenantId", "reportId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalWorkflow_tenantId_type_key" ON "ApprovalWorkflow"("tenantId", "type");

-- CreateIndex
CREATE INDEX "AutomationRule_tenantId_isEnabled_nextRunAt_idx" ON "AutomationRule"("tenantId", "isEnabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "AutomationRuleRun_tenantId_ruleId_createdAt_idx" ON "AutomationRuleRun"("tenantId", "ruleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRuleHit_ruleId_rowKey_key" ON "AutomationRuleHit"("ruleId", "rowKey");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyPolicy_tenantId_version_key" ON "PrivacyPolicy"("tenantId", "version");

-- CreateIndex
CREATE INDEX "PolicyAcceptance_tenantId_userId_idx" ON "PolicyAcceptance"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcceptance_policyId_userId_key" ON "PolicyAcceptance"("policyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentType_tenantId_key_key" ON "ConsentType"("tenantId", "key");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_consentTypeId_studentId_createdAt_idx" ON "ConsentRecord"("tenantId", "consentTypeId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_consentTypeId_employeeId_createdAt_idx" ON "ConsentRecord"("tenantId", "consentTypeId", "employeeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_tenantId_category_key" ON "RetentionPolicy"("tenantId", "category");

-- CreateIndex
CREATE INDEX "RetentionRun_tenantId_createdAt_idx" ON "RetentionRun"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "DataRequest_tenantId_status_idx" ON "DataRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DataRequest_tenantId_number_key" ON "DataRequest"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "EDocument_verifyCode_key" ON "EDocument"("verifyCode");

-- CreateIndex
CREATE INDEX "EDocument_tenantId_status_idx" ON "EDocument"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EDocument_tenantId_number_key" ON "EDocument"("tenantId", "number");

-- CreateIndex
CREATE INDEX "EDocumentSigner_tenantId_userId_status_idx" ON "EDocumentSigner"("tenantId", "userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EDocumentSigner_documentId_order_key" ON "EDocumentSigner"("documentId", "order");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_status_idx" ON "SupportTicket"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_requesterId_idx" ON "SupportTicket"("tenantId", "requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_tenantId_number_key" ON "SupportTicket"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_tenantId_slug_key" ON "KnowledgeArticle"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "BackupRun_tenantId_createdAt_idx" ON "BackupRun"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackupRun_tenantId_number_key" ON "BackupRun"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SavedReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRuleRun" ADD CONSTRAINT "AutomationRuleRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRuleHit" ADD CONSTRAINT "AutomationRuleHit_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcceptance" ADD CONSTRAINT "PolicyAcceptance_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PrivacyPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_consentTypeId_fkey" FOREIGN KEY ("consentTypeId") REFERENCES "ConsentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EDocumentSigner" ADD CONSTRAINT "EDocumentSigner_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketReply" ADD CONSTRAINT "SupportTicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =====================================================================
-- ضمانات المرحلة ٧
-- =====================================================================

-- الخطوات النشطة الحالية تبدأ مهلتها من لحظة الترحيل
UPDATE "ApprovalStep" s SET "activatedAt" = r."updatedAt"
FROM "ApprovalRequest" r
WHERE s."requestId" = r.id AND r.status = 'PENDING' AND s."order" = r."currentStep";

-- سجلات الموافقات وقبول سياسة الخصوصية دليل قانوني: إلحاق فقط
CREATE OR REPLACE FUNCTION manassa_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'هذا السجل دليل امتثال لا يُعدَّل ولا يُحذف؛ سجّل حالة جديدة بدلاً منه' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER consent_record_append_only BEFORE UPDATE OR DELETE ON "ConsentRecord" FOR EACH ROW EXECUTE FUNCTION manassa_append_only();
CREATE TRIGGER policy_acceptance_append_only BEFORE UPDATE OR DELETE ON "PolicyAcceptance" FOR EACH ROW EXECUTE FUNCTION manassa_append_only();
CREATE TRIGGER retention_run_append_only BEFORE UPDATE OR DELETE ON "RetentionRun" FOR EACH ROW EXECUTE FUNCTION manassa_append_only();

-- حالات الموافقة المسموحة
ALTER TABLE "ConsentRecord" ADD CONSTRAINT consent_status_valid CHECK (status IN ('GRANTED', 'WITHDRAWN', 'DENIED'));
ALTER TABLE "ConsentRecord" ADD CONSTRAINT consent_subject_valid CHECK (("studentId" IS NOT NULL) <> ("employeeId" IS NOT NULL));

-- سياسة الخصوصية المنشورة لا يتغير نصها (يُنشأ إصدار جديد)
CREATE OR REPLACE FUNCTION manassa_policy_locked() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'لا يُحذف إصدار منشور من سياسة الخصوصية' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND (NEW.body IS DISTINCT FROM OLD.body OR NEW.title IS DISTINCT FROM OLD.title OR NEW.version IS DISTINCT FROM OLD.version OR NEW.audience IS DISTINCT FROM OLD.audience) THEN
    RAISE EXCEPTION 'نص السياسة المنشورة لا يُعدَّل؛ أنشئ إصداراً جديداً' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER privacy_policy_locked BEFORE UPDATE OR DELETE ON "PrivacyPolicy" FOR EACH ROW EXECUTE FUNCTION manassa_policy_locked();

-- المستند المرسل للتوقيع لا يتغير محتواه ولا بصمته
CREATE OR REPLACE FUNCTION manassa_edoc_locked() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'لا يُحذف مستند أُرسل للتوقيع؛ يمكن إلغاؤه أو أرشفته' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND (NEW.body IS DISTINCT FROM OLD.body OR NEW.title IS DISTINCT FROM OLD.title OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash" OR NEW."fileId" IS DISTINCT FROM OLD."fileId") THEN
    RAISE EXCEPTION 'محتوى المستند مقفل بعد إرساله للتوقيع' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER edocument_locked BEFORE UPDATE OR DELETE ON "EDocument" FOR EACH ROW EXECUTE FUNCTION manassa_edoc_locked();

-- التوقيع بعد إتمامه لا يُعدَّل ولا يُحذف
CREATE OR REPLACE FUNCTION manassa_signature_locked() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'SIGNED' THEN
      RAISE EXCEPTION 'لا يُحذف توقيع مكتمل' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'SIGNED' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW."signatureData" IS DISTINCT FROM OLD."signatureData" OR NEW."signatureHash" IS DISTINCT FROM OLD."signatureHash" OR NEW."signedAt" IS DISTINCT FROM OLD."signedAt" OR NEW."typedName" IS DISTINCT FROM OLD."typedName" OR NEW."userId" IS DISTINCT FROM OLD."userId") THEN
    RAISE EXCEPTION 'التوقيع المكتمل مقفل' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER edocument_signature_locked BEFORE UPDATE OR DELETE ON "EDocumentSigner" FOR EACH ROW EXECUTE FUNCTION manassa_signature_locked();

-- قيم صالحة
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT retention_days_valid CHECK ("retainDays" >= 30);
ALTER TABLE "SupportTicket" ADD CONSTRAINT ticket_satisfaction_valid CHECK ("satisfaction" IS NULL OR ("satisfaction" BETWEEN 1 AND 5));
ALTER TABLE "AutomationRule" ADD CONSTRAINT automation_rule_valid CHECK ("threshold" >= 1 AND "cooldownDays" >= 0);

-- بحث نصي في المستندات وقاعدة المعرفة
CREATE INDEX edocument_search_idx ON "EDocument" USING GIN (to_tsvector('simple', "searchText"));
CREATE INDEX knowledge_search_idx ON "KnowledgeArticle" USING GIN (to_tsvector('simple', "searchText"));
