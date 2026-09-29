-- CreateEnum
CREATE TYPE "ExamKind" AS ENUM ('DAILY', 'MONTHLY', 'MIDTERM', 'FINAL');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StaffAttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'HOLIDAY', 'EXCUSED');

-- CreateTable
CREATE TABLE "GradingScheme" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stageId" TEXT,
    "name" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "passBp" INTEGER NOT NULL DEFAULT 5000,
    "bands" JSONB NOT NULL,
    "maxSecondRoundSubjects" INTEGER NOT NULL DEFAULT 3,
    "display" TEXT NOT NULL DEFAULT 'PERCENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "GradingScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "branchId" TEXT,
    "title" TEXT NOT NULL,
    "kind" "ExamKind" NOT NULL DEFAULT 'MIDTERM',
    "componentKey" TEXT NOT NULL,
    "gradeIds" TEXT[],
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "instructions" TEXT,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 90,
    "maxTenths" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamCommittee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "roomId" TEXT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "invigilatorIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamCommittee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSeat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,

    CONSTRAINT "ExamSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvigilationReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "absentStudentIds" TEXT[],
    "incidents" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvigilationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT,
    "componentKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "maxTenths" INTEGER NOT NULL,
    "date" DATE,
    "examSessionId" TEXT,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "returnNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "scoreTenths" INTEGER,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "excused" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "oldTenths" INTEGER,
    "newTenths" INTEGER,
    "oldAbsent" BOOLEAN NOT NULL DEFAULT false,
    "newAbsent" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalRequestId" TEXT,
    "requestedById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCardTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "signatures" JSONB NOT NULL DEFAULT '[]',
    "stampUrl" TEXT,
    "footerNote" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ReportCardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultPublication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "publishAt" TIMESTAMP(3) NOT NULL,
    "withholdOnDebt" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sectionId" TEXT,
    "verifyCode" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "averageBp" INTEGER NOT NULL,
    "rank" INTEGER,
    "result" TEXT NOT NULL,
    "templateId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "headEmployeeId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'ADMIN',
    "costCenterId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "userId" TEXT,
    "branchId" TEXT,
    "departmentId" TEXT,
    "positionId" TEXT,
    "managerId" TEXT,
    "fullName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'MALE',
    "birthDate" DATE,
    "nationality" TEXT NOT NULL DEFAULT 'SA',
    "maritalStatus" TEXT,
    "idType" "IdType" NOT NULL DEFAULT 'NATIONAL_ID',
    "nationalIdHash" TEXT,
    "nationalIdEnc" TEXT,
    "nationalIdLast4" TEXT,
    "idExpiry" DATE,
    "passportNumber" TEXT,
    "passportExpiry" DATE,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "qualifications" JSONB NOT NULL DEFAULT '[]',
    "experiences" JSONB NOT NULL DEFAULT '[]',
    "bankName" TEXT,
    "iban" TEXT,
    "sponsor" TEXT,
    "hireDate" DATE NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "terminationDate" DATE,
    "terminationReason" TEXT,
    "category" TEXT NOT NULL DEFAULT 'ADMIN',
    "shiftId" TEXT,
    "gosiRegistered" BOOLEAN NOT NULL DEFAULT true,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "photoUrl" TEXT,
    "notes" TEXT,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentContract" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FIXED',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "probationEnd" DATE,
    "basicMinor" INTEGER NOT NULL,
    "housingMinor" INTEGER NOT NULL DEFAULT 0,
    "transportMinor" INTEGER NOT NULL DEFAULT 0,
    "otherAllowances" JSONB NOT NULL DEFAULT '[]',
    "hoursPerDay" INTEGER NOT NULL DEFAULT 8,
    "annualLeaveDays" INTEGER NOT NULL DEFAULT 21,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmploymentContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" TEXT,
    "positionId" TEXT,
    "branchId" TEXT,
    "description" TEXT,
    "requirements" TEXT,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closingDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "openingId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "nationality" TEXT NOT NULL DEFAULT 'SA',
    "gender" "Gender" NOT NULL DEFAULT 'MALE',
    "qualification" TEXT,
    "experienceYears" INTEGER NOT NULL DEFAULT 0,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'APPLIED',
    "interviewAt" TIMESTAMP(3),
    "rating" INTEGER,
    "offerSalaryMinor" INTEGER,
    "cv" JSONB,
    "notes" TEXT,
    "employeeId" TEXT,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 10,
    "workDays" INTEGER[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAttendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" "StaffAttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "annualDays" INTEGER,
    "accrual" TEXT NOT NULL DEFAULT 'YEARLY',
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "maxPerRequest" INTEGER,
    "carryOverDays" INTEGER NOT NULL DEFAULT 0,
    "gender" TEXT,
    "color" TEXT NOT NULL DEFAULT 'teal',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitledDays" INTEGER NOT NULL DEFAULT 0,
    "carriedDays" INTEGER NOT NULL DEFAULT 0,
    "usedDays" INTEGER NOT NULL DEFAULT 0,
    "adjustedDays" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffLeaveRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalRequestId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StaffLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLoan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "installmentMinor" INTEGER NOT NULL,
    "startMonth" TEXT NOT NULL,
    "repaidMinor" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "approvalRequestId" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "hours" INTEGER,
    "description" TEXT NOT NULL,
    "payrollRunId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "grossMinor" INTEGER NOT NULL DEFAULT 0,
    "deductionsMinor" INTEGER NOT NULL DEFAULT 0,
    "netMinor" INTEGER NOT NULL DEFAULT 0,
    "employerGosiMinor" INTEGER NOT NULL DEFAULT 0,
    "eosAccrualMinor" INTEGER NOT NULL DEFAULT 0,
    "employees" INTEGER NOT NULL DEFAULT 0,
    "approvalRequestId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "bankAccountId" TEXT,
    "journalEntryId" TEXT,
    "paymentEntryId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT,
    "category" TEXT NOT NULL,
    "branchId" TEXT,
    "basicMinor" INTEGER NOT NULL,
    "housingMinor" INTEGER NOT NULL DEFAULT 0,
    "transportMinor" INTEGER NOT NULL DEFAULT 0,
    "otherAllowancesMinor" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinor" INTEGER NOT NULL DEFAULT 0,
    "bonusMinor" INTEGER NOT NULL DEFAULT 0,
    "grossMinor" INTEGER NOT NULL,
    "gosiEmployeeMinor" INTEGER NOT NULL DEFAULT 0,
    "gosiEmployerMinor" INTEGER NOT NULL DEFAULT 0,
    "absenceMinor" INTEGER NOT NULL DEFAULT 0,
    "lateMinor" INTEGER NOT NULL DEFAULT 0,
    "unpaidLeaveMinor" INTEGER NOT NULL DEFAULT 0,
    "loanMinor" INTEGER NOT NULL DEFAULT 0,
    "penaltyMinor" INTEGER NOT NULL DEFAULT 0,
    "otherDeductionMinor" INTEGER NOT NULL DEFAULT 0,
    "deductionsMinor" INTEGER NOT NULL DEFAULT 0,
    "netMinor" INTEGER NOT NULL,
    "eosAccrualMinor" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL DEFAULT '{}',
    "iban" TEXT,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndOfService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "lastWorkingDay" DATE NOT NULL,
    "serviceDays" INTEGER NOT NULL,
    "wageMinor" INTEGER NOT NULL,
    "eosMinor" INTEGER NOT NULL,
    "leaveDays" INTEGER NOT NULL DEFAULT 0,
    "leaveEncashmentMinor" INTEGER NOT NULL DEFAULT 0,
    "unpaidSalaryMinor" INTEGER NOT NULL DEFAULT 0,
    "loanBalanceMinor" INTEGER NOT NULL DEFAULT 0,
    "otherDeductionsMinor" INTEGER NOT NULL DEFAULT 0,
    "netMinor" INTEGER NOT NULL,
    "calculation" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalRequestId" TEXT,
    "journalEntryId" TEXT,
    "paymentEntryId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "EndOfService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCycle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ReviewCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "selfScores" JSONB NOT NULL DEFAULT '{}',
    "managerScores" JSONB NOT NULL DEFAULT '{}',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "selfComment" TEXT,
    "managerComment" TEXT,
    "selfSubmittedAt" TIMESTAMP(3),
    "managerSubmittedAt" TIMESTAMP(3),
    "finalBp" INTEGER,
    "rating" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_SELF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradingScheme_tenantId_stageId_idx" ON "GradingScheme"("tenantId", "stageId");

-- CreateIndex
CREATE INDEX "Exam_tenantId_termId_idx" ON "Exam"("tenantId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_tenantId_number_key" ON "Exam"("tenantId", "number");

-- CreateIndex
CREATE INDEX "ExamSession_tenantId_date_idx" ON "ExamSession"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSession_examId_gradeId_subjectId_key" ON "ExamSession"("examId", "gradeId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamCommittee_examId_number_key" ON "ExamCommittee"("examId", "number");

-- CreateIndex
CREATE INDEX "ExamSeat_committeeId_idx" ON "ExamSeat"("committeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeat_examId_studentId_key" ON "ExamSeat"("examId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeat_examId_seatNumber_key" ON "ExamSeat"("examId", "seatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InvigilationReport_sessionId_committeeId_key" ON "InvigilationReport"("sessionId", "committeeId");

-- CreateIndex
CREATE INDEX "Assessment_tenantId_termId_sectionId_subjectId_idx" ON "Assessment"("tenantId", "termId", "sectionId", "subjectId");

-- CreateIndex
CREATE INDEX "Assessment_tenantId_status_idx" ON "Assessment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Mark_tenantId_studentId_idx" ON "Mark"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Mark_assessmentId_studentId_key" ON "Mark"("assessmentId", "studentId");

-- CreateIndex
CREATE INDEX "GradeChangeRequest_tenantId_status_idx" ON "GradeChangeRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GradeChangeRequest_tenantId_number_key" ON "GradeChangeRequest"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ResultPublication_termId_key" ON "ResultPublication"("termId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCard_verifyCode_key" ON "ReportCard"("verifyCode");

-- CreateIndex
CREATE INDEX "ReportCard_tenantId_termId_idx" ON "ReportCard"("tenantId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCard_termId_studentId_key" ON "ReportCard"("termId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_code_key" ON "Department"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_status_idx" ON "Employee"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_number_key" ON "Employee"("tenantId", "number");

-- CreateIndex
CREATE INDEX "EmploymentContract_employeeId_status_idx" ON "EmploymentContract"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentContract_tenantId_number_key" ON "EmploymentContract"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "JobOpening_tenantId_number_key" ON "JobOpening"("tenantId", "number");

-- CreateIndex
CREATE INDEX "JobApplication_tenantId_stage_idx" ON "JobApplication"("tenantId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_tenantId_number_key" ON "JobApplication"("tenantId", "number");

-- CreateIndex
CREATE INDEX "EmployeeAttendance_tenantId_date_idx" ON "EmployeeAttendance"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAttendance_employeeId_date_key" ON "EmployeeAttendance"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_tenantId_code_key" ON "LeaveType"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_leaveTypeId_year_key" ON "LeaveBalance"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "StaffLeaveRequest_tenantId_status_idx" ON "StaffLeaveRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffLeaveRequest_tenantId_number_key" ON "StaffLeaveRequest"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeLoan_tenantId_number_key" ON "EmployeeLoan"("tenantId", "number");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_tenantId_month_idx" ON "PayrollAdjustment"("tenantId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_tenantId_number_key" ON "PayrollRun"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_tenantId_month_key" ON "PayrollRun"("tenantId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_runId_employeeId_key" ON "PayrollLine"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "EndOfService_tenantId_employeeId_idx" ON "EndOfService"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EndOfService_tenantId_number_key" ON "EndOfService"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceReview_cycleId_employeeId_key" ON "PerformanceReview"("cycleId", "employeeId");

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamCommittee" ADD CONSTRAINT "ExamCommittee_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "ExamCommittee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvigilationReport" ADD CONSTRAINT "InvigilationReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeChangeRequest" ADD CONSTRAINT "GradeChangeRequest_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "JobOpening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAttendance" ADD CONSTRAINT "EmployeeAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLeaveRequest" ADD CONSTRAINT "StaffLeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =====================================================================
-- قفل الدرجات بعد الاعتماد: لا إدخال ولا تعديل ولا حذف لدرجات بند معتمد
-- إلا ضمن معاملة تطبيق طلب تعديل معتمد (تضبط manassa.allow_mark_change)
-- =====================================================================
CREATE OR REPLACE FUNCTION manassa_protect_marks() RETURNS trigger AS $$
DECLARE
  st TEXT;
  aid TEXT;
BEGIN
  aid := COALESCE(NEW."assessmentId", OLD."assessmentId");
  SELECT status::text INTO st FROM "Assessment" WHERE id = aid;
  IF st = 'APPROVED' AND COALESCE(current_setting('manassa.allow_mark_change', true), '') <> 'on' THEN
    RAISE EXCEPTION 'الدرجات معتمدة ومقفلة؛ التعديل بطلب تعديل معتمد فقط' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER mark_locked_after_approval BEFORE INSERT OR UPDATE OR DELETE ON "Mark" FOR EACH ROW EXECUTE FUNCTION manassa_protect_marks();

-- الدرجة ضمن حدود البند
CREATE OR REPLACE FUNCTION manassa_check_mark_range() RETURNS trigger AS $$
DECLARE
  mx INT;
BEGIN
  IF NEW."scoreTenths" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "maxTenths" INTO mx FROM "Assessment" WHERE id = NEW."assessmentId";
  IF NEW."scoreTenths" < 0 OR NEW."scoreTenths" > mx THEN
    RAISE EXCEPTION 'الدرجة خارج حدود البند' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER mark_in_range BEFORE INSERT OR UPDATE ON "Mark" FOR EACH ROW EXECUTE FUNCTION manassa_check_mark_range();

-- مبالغ الرواتب غير سالبة
ALTER TABLE "PayrollLine" ADD CONSTRAINT payroll_line_non_negative CHECK ("grossMinor" >= 0 AND "deductionsMinor" >= 0 AND "basicMinor" >= 0);
ALTER TABLE "EmploymentContract" ADD CONSTRAINT contract_amounts_non_negative CHECK ("basicMinor" >= 0 AND "housingMinor" >= 0 AND "transportMinor" >= 0);
