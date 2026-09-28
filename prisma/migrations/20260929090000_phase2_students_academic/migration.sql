-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "IdType" AS ENUM ('NATIONAL_ID', 'IQAMA', 'PASSPORT');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN', 'DEFERRED');

-- CreateEnum
CREATE TYPE "GuardianRelation" AS ENUM ('FATHER', 'MOTHER', 'GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "AdmissionStage" AS ENUM ('NEW', 'REVIEW', 'ASSESSMENT', 'ACCEPTED', 'REJECTED', 'WAITLIST', 'ENROLLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'PERMISSION', 'EXCUSED');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('SECTION', 'GRADE', 'INCOMING', 'OUTGOING', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BehaviorKind" AS ENUM ('POSITIVE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'MONITORING', 'CLOSED');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('CLUB', 'COMMITTEE', 'TRIP', 'COMPETITION', 'EVENT');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PLANNED', 'REGISTRATION', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Database" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "DatabaseProperty" ADD COLUMN     "systemKey" TEXT;

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idType" "IdType" NOT NULL DEFAULT 'NATIONAL_ID',
    "nationalIdHash" TEXT,
    "nationalIdEnc" TEXT,
    "nationalIdLast4" TEXT,
    "phone" TEXT NOT NULL,
    "phoneAlt" TEXT,
    "email" TEXT,
    "occupation" TEXT,
    "employer" TEXT,
    "address" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "academicNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "fatherName" TEXT NOT NULL,
    "grandfatherName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "nationality" TEXT NOT NULL DEFAULT 'SA',
    "idType" "IdType" NOT NULL DEFAULT 'NATIONAL_ID',
    "nationalIdHash" TEXT,
    "nationalIdEnc" TEXT,
    "nationalIdLast4" TEXT,
    "birthDate" DATE NOT NULL,
    "birthPlace" TEXT,
    "photoUrl" TEXT,
    "cover" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "academicYearId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "sectionId" TEXT,
    "enrollmentDate" DATE NOT NULL,
    "previousSchool" TEXT,
    "bloodType" TEXT,
    "chronicConditions" TEXT,
    "allergies" TEXT,
    "medications" TEXT,
    "criticalHealth" BOOLEAN NOT NULL DEFAULT false,
    "healthNotes" TEXT,
    "transportMode" TEXT,
    "busNumber" TEXT,
    "mealPlan" TEXT,
    "emergencyContacts" JSONB NOT NULL DEFAULT '[]',
    "notes" JSONB,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGuardian" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relation" "GuardianRelation" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "canPickup" BOOLEAN NOT NULL DEFAULT true,
    "receivesNotifications" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mime" TEXT,
    "expiresAt" DATE,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "stage" "AdmissionStage" NOT NULL DEFAULT 'NEW',
    "firstName" TEXT NOT NULL,
    "fatherName" TEXT NOT NULL DEFAULT '',
    "grandfatherName" TEXT NOT NULL DEFAULT '',
    "familyName" TEXT NOT NULL DEFAULT '',
    "fullName" TEXT NOT NULL,
    "gender" "Gender",
    "nationality" TEXT NOT NULL DEFAULT 'SA',
    "idType" "IdType" NOT NULL DEFAULT 'NATIONAL_ID',
    "nationalIdHash" TEXT,
    "nationalIdEnc" TEXT,
    "nationalIdLast4" TEXT,
    "birthDate" DATE,
    "requestedGradeId" TEXT,
    "previousSchool" TEXT,
    "guardianName" TEXT,
    "guardianRelation" "GuardianRelation",
    "guardianPhone" TEXT,
    "guardianEmail" TEXT,
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "address" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT,
    "ownerId" TEXT,
    "assessmentAt" TIMESTAMP(3),
    "assessmentScore" INTEGER,
    "assessmentNotes" TEXT,
    "decisionAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "submittedVia" TEXT NOT NULL DEFAULT 'STAFF',
    "studentId" TEXT,
    "notes" JSONB,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "period" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceStatus" NOT NULL,
    "reason" TEXT,
    "minutesLate" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "leaveId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentLeave" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LEAVE',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StudentLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "TransferType" NOT NULL,
    "fromSectionId" TEXT,
    "toSectionId" TEXT,
    "toGradeId" TEXT,
    "otherSchool" TEXT,
    "reason" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "approvalRequestId" TEXT,
    "financialClearance" BOOLEAN NOT NULL DEFAULT false,
    "clearedById" TEXT,
    "clearedAt" TIMESTAMP(3),
    "certificateNumber" TEXT,
    "certificateIssuedAt" TIMESTAMP(3),
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "notes" JSONB,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BehaviorRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "BehaviorKind" NOT NULL,
    "category" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "severity" "Severity" NOT NULL DEFAULT 'LOW',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "actionTaken" TEXT,
    "guardianNotified" BOOLEAN NOT NULL DEFAULT false,
    "reportedById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BehaviorRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounselingCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'LOW',
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "counselorId" TEXT NOT NULL,
    "plan" JSONB,
    "guardianSummonedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CounselingCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounselingSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "attendees" TEXT,
    "summary" TEXT,
    "calendarEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "CounselingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CLASSROOM',
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'navy',
    "roomKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSubject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "weeklyPeriods" INTEGER NOT NULL DEFAULT 4,
    "textbook" TEXT,
    "heavy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "GradeSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gradeSubjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "objectives" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumLesson" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "week" INTEGER,
    "periods" INTEGER NOT NULL DEFAULT 1,
    "objectives" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedById" TEXT,
    "note" TEXT,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherLoad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 24,
    "freeDay" INTEGER,
    "subjectIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "TeacherLoad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "weeklyPeriods" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "TeacherAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BellSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER[],
    "periods" JSONB NOT NULL,
    "maxConsecutive" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "BellSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "roomId" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Substitution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "absentTeacherId" TEXT NOT NULL,
    "substituteTeacherId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Substitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL DEFAULT 'CLUB',
    "status" "ActivityStatus" NOT NULL DEFAULT 'PLANNED',
    "description" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "location" TEXT,
    "supervisorId" TEXT,
    "capacity" INTEGER,
    "feeMinor" INTEGER,
    "requiresConsent" BOOLEAN NOT NULL DEFAULT false,
    "gradeIds" TEXT[],
    "calendarEventId" TEXT,
    "cover" TEXT,
    "album" JSONB NOT NULL DEFAULT '[]',
    "notes" JSONB,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityRegistration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "consentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "consentBy" TEXT,
    "consentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Guardian_tenantId_phone_idx" ON "Guardian"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_tenantId_nationalIdHash_key" ON "Guardian"("tenantId", "nationalIdHash");

-- CreateIndex
CREATE INDEX "Student_tenantId_branchId_status_idx" ON "Student"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "Student_tenantId_gradeId_sectionId_idx" ON "Student"("tenantId", "gradeId", "sectionId");

-- CreateIndex
CREATE INDEX "Student_tenantId_fullName_idx" ON "Student"("tenantId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Student_tenantId_academicNumber_key" ON "Student"("tenantId", "academicNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Student_tenantId_nationalIdHash_key" ON "Student"("tenantId", "nationalIdHash");

-- CreateIndex
CREATE INDEX "StudentGuardian_tenantId_guardianId_idx" ON "StudentGuardian"("tenantId", "guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGuardian_studentId_guardianId_key" ON "StudentGuardian"("studentId", "guardianId");

-- CreateIndex
CREATE INDEX "StudentDocument_tenantId_studentId_idx" ON "StudentDocument"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_studentId_key" ON "Admission"("studentId");

-- CreateIndex
CREATE INDEX "Admission_tenantId_stage_idx" ON "Admission"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "Admission_tenantId_nationalIdHash_idx" ON "Admission"("tenantId", "nationalIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_tenantId_number_key" ON "Admission"("tenantId", "number");

-- CreateIndex
CREATE INDEX "Attendance_tenantId_sectionId_date_idx" ON "Attendance"("tenantId", "sectionId", "date");

-- CreateIndex
CREATE INDEX "Attendance_tenantId_date_status_idx" ON "Attendance"("tenantId", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_studentId_date_period_key" ON "Attendance"("studentId", "date", "period");

-- CreateIndex
CREATE INDEX "StudentLeave_tenantId_status_idx" ON "StudentLeave"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudentLeave_tenantId_number_key" ON "StudentLeave"("tenantId", "number");

-- CreateIndex
CREATE INDEX "Transfer_tenantId_status_idx" ON "Transfer"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_tenantId_number_key" ON "Transfer"("tenantId", "number");

-- CreateIndex
CREATE INDEX "BehaviorRecord_tenantId_studentId_idx" ON "BehaviorRecord"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "BehaviorRecord_tenantId_occurredAt_idx" ON "BehaviorRecord"("tenantId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "BehaviorRecord_tenantId_number_key" ON "BehaviorRecord"("tenantId", "number");

-- CreateIndex
CREATE INDEX "CounselingCase_tenantId_counselorId_idx" ON "CounselingCase"("tenantId", "counselorId");

-- CreateIndex
CREATE INDEX "CounselingCase_tenantId_studentId_idx" ON "CounselingCase"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CounselingCase_tenantId_number_key" ON "CounselingCase"("tenantId", "number");

-- CreateIndex
CREATE INDEX "CounselingSession_tenantId_caseId_idx" ON "CounselingSession"("tenantId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_tenantId_branchId_code_key" ON "Room"("tenantId", "branchId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_tenantId_code_key" ON "Subject"("tenantId", "code");

-- CreateIndex
CREATE INDEX "GradeSubject_tenantId_idx" ON "GradeSubject"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSubject_gradeId_subjectId_key" ON "GradeSubject"("gradeId", "subjectId");

-- CreateIndex
CREATE INDEX "CurriculumUnit_tenantId_gradeSubjectId_idx" ON "CurriculumUnit"("tenantId", "gradeSubjectId");

-- CreateIndex
CREATE INDEX "CurriculumLesson_tenantId_unitId_idx" ON "CurriculumLesson"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "LessonProgress_tenantId_sectionId_idx" ON "LessonProgress"("tenantId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_lessonId_sectionId_key" ON "LessonProgress"("lessonId", "sectionId");

-- CreateIndex
CREATE INDEX "TeacherLoad_tenantId_academicYearId_idx" ON "TeacherLoad"("tenantId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherLoad_userId_academicYearId_key" ON "TeacherLoad"("userId", "academicYearId");

-- CreateIndex
CREATE INDEX "TeacherAssignment_tenantId_teacherId_idx" ON "TeacherAssignment"("tenantId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAssignment_academicYearId_sectionId_subjectId_key" ON "TeacherAssignment"("academicYearId", "sectionId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "BellSchedule_tenantId_branchId_key" ON "BellSchedule"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "TimetableSlot_tenantId_academicYearId_idx" ON "TimetableSlot"("tenantId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_academicYearId_sectionId_day_period_key" ON "TimetableSlot"("academicYearId", "sectionId", "day", "period");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_academicYearId_teacherId_day_period_key" ON "TimetableSlot"("academicYearId", "teacherId", "day", "period");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_academicYearId_roomId_day_period_key" ON "TimetableSlot"("academicYearId", "roomId", "day", "period");

-- CreateIndex
CREATE INDEX "Substitution_tenantId_date_idx" ON "Substitution"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Substitution_slotId_date_key" ON "Substitution"("slotId", "date");

-- CreateIndex
CREATE INDEX "Activity_tenantId_status_idx" ON "Activity"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_tenantId_number_key" ON "Activity"("tenantId", "number");

-- CreateIndex
CREATE INDEX "ActivityRegistration_tenantId_studentId_idx" ON "ActivityRegistration"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityRegistration_activityId_studentId_key" ON "ActivityRegistration"("activityId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Database_tenantId_source_key" ON "Database"("tenantId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "DatabaseProperty_databaseId_systemKey_key" ON "DatabaseProperty"("databaseId", "systemKey");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_requestedGradeId_fkey" FOREIGN KEY ("requestedGradeId") REFERENCES "Grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLeave" ADD CONSTRAINT "StudentLeave_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorRecord" ADD CONSTRAINT "BehaviorRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselingCase" ADD CONSTRAINT "CounselingCase_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselingSession" ADD CONSTRAINT "CounselingSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CounselingCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSubject" ADD CONSTRAINT "GradeSubject_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSubject" ADD CONSTRAINT "GradeSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumUnit" ADD CONSTRAINT "CurriculumUnit_gradeSubjectId_fkey" FOREIGN KEY ("gradeSubjectId") REFERENCES "GradeSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumLesson" ADD CONSTRAINT "CurriculumLesson_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "CurriculumUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "CurriculumLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRegistration" ADD CONSTRAINT "ActivityRegistration_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRegistration" ADD CONSTRAINT "ActivityRegistration_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

