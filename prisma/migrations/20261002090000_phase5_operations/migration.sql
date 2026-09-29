-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalSource" ADD VALUE 'FIXED_ASSET';
ALTER TYPE "JournalSource" ADD VALUE 'DEPRECIATION';
ALTER TYPE "JournalSource" ADD VALUE 'INVENTORY';
ALTER TYPE "JournalSource" ADD VALUE 'GOODS_RECEIPT';
ALTER TYPE "JournalSource" ADD VALUE 'SUPPLIER_BILL';
ALTER TYPE "JournalSource" ADD VALUE 'SUPPLIER_PAYMENT';
ALTER TYPE "JournalSource" ADD VALUE 'SALE';
ALTER TYPE "JournalSource" ADD VALUE 'WALLET';
ALTER TYPE "JournalSource" ADD VALUE 'OPERATING_EXPENSE';

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalRequestId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "month" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetAccountId" TEXT NOT NULL,
    "accumAccountId" TEXT NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "usefulLifeMonths" INTEGER NOT NULL,
    "decliningRateBp" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "branchId" TEXT,
    "roomId" TEXT,
    "location" TEXT,
    "serialNumber" TEXT,
    "supplierId" TEXT,
    "custodianId" TEXT,
    "costCenterId" TEXT,
    "purchaseDate" DATE NOT NULL,
    "inServiceDate" DATE NOT NULL,
    "costMinor" INTEGER NOT NULL,
    "salvageMinor" INTEGER NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "decliningRateBp" INTEGER,
    "accumulatedMinor" INTEGER NOT NULL DEFAULT 0,
    "lastDepreciatedMonth" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "acquisitionEntryId" TEXT,
    "disposalEntryId" TEXT,
    "disposedAt" DATE,
    "disposalProceedsMinor" INTEGER,
    "disposalGainMinor" INTEGER,
    "notes" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fromText" TEXT,
    "toText" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "assets" INTEGER NOT NULL,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepreciationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "bookValueMinor" INTEGER NOT NULL,

    CONSTRAINT "DepreciationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'SUPPLIES',
    "keeperId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SUPPLY',
    "unit" TEXT NOT NULL DEFAULT 'حبة',
    "minQty" INTEGER NOT NULL DEFAULT 0,
    "reorderQty" INTEGER NOT NULL DEFAULT 0,
    "onHandQty" INTEGER NOT NULL DEFAULT 0,
    "stockValueMinor" INTEGER NOT NULL DEFAULT 0,
    "sellable" BOOLEAN NOT NULL DEFAULT false,
    "salePriceMinor" INTEGER,
    "taxCodeId" TEXT,
    "inventoryAccountId" TEXT NOT NULL,
    "cogsAccountId" TEXT,
    "revenueAccountId" TEXT,
    "expenseAccountId" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostMinor" INTEGER NOT NULL,
    "valueMinor" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "costCenterId" TEXT,
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "taxNumber" TEXT,
    "crNumber" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "iban" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "category" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRating" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderId" TEXT,
    "quality" INTEGER NOT NULL,
    "delivery" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "comment" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "branchId" TEXT,
    "costCenterId" TEXT,
    "requestedById" TEXT NOT NULL,
    "neededBy" DATE,
    "justification" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalRequestId" TEXT,
    "estimatedTotalMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "estUnitMinor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "supplierId" TEXT NOT NULL,
    "requestId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "expectedDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "costCenterId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT,
    "expenseAccountId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitMinor" INTEGER NOT NULL,
    "taxBp" INTEGER NOT NULL DEFAULT 0,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "billedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitMinor" INTEGER NOT NULL,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierBill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderId" TEXT,
    "supplierRef" TEXT NOT NULL,
    "billDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "matchStatus" TEXT NOT NULL DEFAULT 'MATCHED',
    "varianceMinor" INTEGER NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierBillLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "orderLineId" TEXT,
    "accountId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitMinor" INTEGER NOT NULL,
    "taxBp" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupplierBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "supplierId" TEXT NOT NULL,
    "billId" TEXT,
    "date" DATE NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "reference" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "varianceMinor" INTEGER NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warehouseId" TEXT NOT NULL,
    "branchId" TEXT,
    "studentId" TEXT,
    "customerName" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "invoiceId" TEXT,
    "journalEntryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "cashierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitMinor" INTEGER NOT NULL,
    "taxBp" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "costMinor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentWallet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "balanceMinor" INTEGER NOT NULL DEFAULT 0,
    "dailyLimitMinor" INTEGER,
    "lowBalanceMinor" INTEGER,
    "notifyPurchases" BOOLEAN NOT NULL DEFAULT true,
    "blockedCategories" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "balanceAfterMinor" INTEGER NOT NULL,
    "method" TEXT,
    "saleId" TEXT,
    "journalEntryId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "branchId" TEXT,
    "roomId" TEXT,
    "location" TEXT,
    "assetId" TEXT,
    "busId" TEXT,
    "reportedById" TEXT,
    "assigneeId" TEXT,
    "dueDate" DATE,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "beforePhotos" JSONB NOT NULL DEFAULT '[]',
    "afterPhotos" JSONB NOT NULL DEFAULT '[]',
    "partsCostMinor" INTEGER NOT NULL DEFAULT 0,
    "externalCostMinor" INTEGER NOT NULL DEFAULT 0,
    "vendorName" TEXT,
    "journalEntryId" TEXT,
    "scheduleId" TEXT,
    "resolution" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "branchId" TEXT,
    "roomId" TEXT,
    "assetId" TEXT,
    "busId" TEXT,
    "assigneeId" TEXT,
    "frequencyDays" INTEGER NOT NULL,
    "nextDue" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomBooking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "bookedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "model" TEXT,
    "year" INTEGER,
    "capacity" INTEGER NOT NULL,
    "branchId" TEXT,
    "driverId" TEXT,
    "supervisorId" TEXT,
    "assetId" TEXT,
    "insuranceExpiry" DATE,
    "licenseExpiry" DATE,
    "inspectionExpiry" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportRoute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "busId" TEXT,
    "branchId" TEXT,
    "annualFeeMinor" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportStop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "morningTime" TEXT,
    "afternoonTime" TEXT,

    CONSTRAINT "TransportStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "stopId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'BOTH',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "invoiceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "odometer" INTEGER,
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusTrip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shift" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "currentStopId" TEXT,
    "boarded" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "BusTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryBook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publisher" TEXT,
    "year" INTEGER,
    "category" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "callNumber" TEXT,
    "description" TEXT,
    "coverUrl" TEXT,
    "isDigital" BOOLEAN NOT NULL DEFAULT false,
    "digitalUrl" TEXT,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LibraryBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryCopy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "shelf" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "acquiredAt" DATE,
    "priceMinor" INTEGER,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryLoan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "studentId" TEXT,
    "userId" TEXT,
    "borrowerName" TEXT NOT NULL,
    "loanedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATE NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "renewals" INTEGER NOT NULL DEFAULT 0,
    "fineMinor" INTEGER NOT NULL DEFAULT 0,
    "fineStatus" TEXT NOT NULL DEFAULT 'NONE',
    "fineInvoiceId" TEXT,
    "issuedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "LibraryLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "studentId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "copyId" TEXT,
    "readyUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryStockTake" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "scanned" JSONB NOT NULL DEFAULT '[]',
    "missing" INTEGER,
    "createdById" TEXT,

    CONSTRAINT "LibraryStockTake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "idLast4" TEXT,
    "idHash" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "purpose" TEXT NOT NULL,
    "hostName" TEXT,
    "hostUserId" TEXT,
    "branchId" TEXT,
    "badgeCode" TEXT NOT NULL,
    "expectedAt" TIMESTAMP(3),
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "vehiclePlate" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizedPickup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "idLast4" TEXT,
    "idHash" TEXT,
    "phone" TEXT,
    "photoUrl" TEXT,
    "validUntil" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizedPickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentPickup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT,
    "authorizedPickupId" TEXT,
    "pickedByName" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "verification" TEXT NOT NULL,
    "early" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "StudentPickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyIncident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "branchId" TEXT,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "involved" JSONB NOT NULL DEFAULT '[]',
    "actionsTaken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "guardiansNotified" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "reportedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyDrill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "branchId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "conductedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "participants" INTEGER,
    "result" TEXT,
    "issues" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyDrill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvacuationPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "title" TEXT NOT NULL,
    "assemblyPoints" TEXT,
    "description" TEXT,
    "fileUrl" TEXT,
    "reviewedAt" DATE,
    "nextReview" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvacuationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicVisit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "studentId" TEXT,
    "employeeId" TEXT,
    "patientName" TEXT NOT NULL,
    "visitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complaintEnc" TEXT NOT NULL,
    "notesEnc" TEXT,
    "temperatureTenths" INTEGER,
    "outcome" TEXT NOT NULL DEFAULT 'RETURNED_TO_CLASS',
    "guardianNotified" BOOLEAN NOT NULL DEFAULT false,
    "nurseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicMedicine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "form" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'قرص',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQty" INTEGER NOT NULL DEFAULT 0,
    "expiryDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicMedicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicDispense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ClinicDispense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Budget_tenantId_fiscalYearId_name_key" ON "Budget"("tenantId", "fiscalYearId", "name");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_accountId_month_idx" ON "BudgetLine"("tenantId", "accountId", "month");

-- CreateIndex
CREATE INDEX "BudgetLine_budgetId_idx" ON "BudgetLine"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_tenantId_code_key" ON "AssetCategory"("tenantId", "code");

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_status_idx" ON "FixedAsset"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_tenantId_number_key" ON "FixedAsset"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_tenantId_tag_key" ON "FixedAsset"("tenantId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRun_tenantId_month_key" ON "DepreciationRun"("tenantId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_tenantId_code_key" ON "Warehouse"("tenantId", "code");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_category_idx" ON "InventoryItem"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_tenantId_sku_key" ON "InventoryItem"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_itemId_warehouseId_key" ON "StockLevel"("itemId", "warehouseId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_itemId_date_idx" ON "StockMovement"("tenantId", "itemId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_tenantId_number_key" ON "StockMovement"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_number_key" ON "Supplier"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_tenantId_number_key" ON "PurchaseRequest"("tenantId", "number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_status_idx" ON "PurchaseOrder"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_tenantId_number_key" ON "PurchaseOrder"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_tenantId_number_key" ON "GoodsReceipt"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierBill_tenantId_number_key" ON "SupplierBill"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierBill_tenantId_supplierId_supplierRef_key" ON "SupplierBill"("tenantId", "supplierId", "supplierRef");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_tenantId_number_key" ON "SupplierPayment"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_tenantId_number_key" ON "StockCount"("tenantId", "number");

-- CreateIndex
CREATE INDEX "Sale_tenantId_kind_date_idx" ON "Sale"("tenantId", "kind", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_tenantId_number_key" ON "Sale"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "StudentWallet_tenantId_studentId_key" ON "StudentWallet"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "WalletTransaction_tenantId_walletId_createdAt_idx" ON "WalletTransaction"("tenantId", "walletId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_tenantId_status_idx" ON "MaintenanceRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceRequest_tenantId_number_key" ON "MaintenanceRequest"("tenantId", "number");

-- CreateIndex
CREATE INDEX "RoomBooking_tenantId_roomId_date_idx" ON "RoomBooking"("tenantId", "roomId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Bus_tenantId_code_key" ON "Bus"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TransportRoute_tenantId_code_key" ON "TransportRoute"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TransportAssignment_tenantId_studentId_status_idx" ON "TransportAssignment"("tenantId", "studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BusTrip_tenantId_routeId_date_shift_key" ON "BusTrip"("tenantId", "routeId", "date", "shift");

-- CreateIndex
CREATE INDEX "LibraryBook_tenantId_isbn_idx" ON "LibraryBook"("tenantId", "isbn");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCopy_tenantId_barcode_key" ON "LibraryCopy"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "LibraryLoan_tenantId_returnedAt_idx" ON "LibraryLoan"("tenantId", "returnedAt");

-- CreateIndex
CREATE INDEX "Visitor_tenantId_checkInAt_idx" ON "Visitor"("tenantId", "checkInAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_tenantId_number_key" ON "Visitor"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_tenantId_badgeCode_key" ON "Visitor"("tenantId", "badgeCode");

-- CreateIndex
CREATE INDEX "StudentPickup_tenantId_at_idx" ON "StudentPickup"("tenantId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyIncident_tenantId_number_key" ON "SafetyIncident"("tenantId", "number");

-- CreateIndex
CREATE INDEX "ClinicVisit_tenantId_studentId_idx" ON "ClinicVisit"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicVisit_tenantId_number_key" ON "ClinicVisit"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMovement" ADD CONSTRAINT "AssetMovement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationLine" ADD CONSTRAINT "DepreciationLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DepreciationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRating" ADD CONSTRAINT "SupplierRating_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestLine" ADD CONSTRAINT "PurchaseRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBillLine" ADD CONSTRAINT "SupplierBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SupplierBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "StudentWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportStop" ADD CONSTRAINT "TransportStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusLog" ADD CONSTRAINT "BusLog_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryCopy" ADD CONSTRAINT "LibraryCopy_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "LibraryBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "LibraryCopy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryReservation" ADD CONSTRAINT "LibraryReservation_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "LibraryBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicDispense" ADD CONSTRAINT "ClinicDispense_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ClinicVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicDispense" ADD CONSTRAINT "ClinicDispense_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "ClinicMedicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- ضمانات قاعدة البيانات للمرحلة ٥
-- =====================================================================

-- المحفظة لا تكون سالبة، والحد اليومي موجب
ALTER TABLE "StudentWallet" ADD CONSTRAINT wallet_non_negative CHECK ("balanceMinor" >= 0 AND ("dailyLimitMinor" IS NULL OR "dailyLimitMinor" >= 0));

-- حركات المحفظة سجل غير قابل للتعديل أو الحذف
CREATE OR REPLACE FUNCTION manassa_wallet_tx_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'حركات المحفظة لا تُعدَّل ولا تُحذف؛ استخدم حركة تسوية' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER wallet_tx_immutable BEFORE UPDATE OR DELETE ON "WalletTransaction" FOR EACH ROW EXECUTE FUNCTION manassa_wallet_tx_immutable();

-- المخزون لا يكون سالباً
ALTER TABLE "InventoryItem" ADD CONSTRAINT inventory_non_negative CHECK ("onHandQty" >= 0 AND "stockValueMinor" >= 0 AND "minQty" >= 0);
ALTER TABLE "StockLevel" ADD CONSTRAINT stock_level_non_negative CHECK ("quantity" >= 0);

-- الأصل: التكلفة موجبة والمجمع لا يتجاوز القيمة القابلة للإهلاك
ALTER TABLE "FixedAsset" ADD CONSTRAINT asset_amounts_valid CHECK ("costMinor" > 0 AND "salvageMinor" >= 0 AND "salvageMinor" < "costMinor" AND "accumulatedMinor" >= 0 AND "accumulatedMinor" <= "costMinor" - "salvageMinor" AND "usefulLifeMonths" > 0);

-- فاتورة المورد: المسدد لا يتجاوز الإجمالي
ALTER TABLE "SupplierBill" ADD CONSTRAINT supplier_bill_paid_le_total CHECK ("paidMinor" >= 0 AND "paidMinor" <= "totalMinor" AND "totalMinor" >= 0);

-- أمر الشراء: المستلم والمفوتر لا يتجاوزان المطلوب
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT po_line_qty_valid CHECK ("quantity" > 0 AND "receivedQty" >= 0 AND "receivedQty" <= "quantity" AND "billedQty" >= 0 AND "billedQty" <= "receivedQty" OR ("expenseAccountId" IS NOT NULL AND "billedQty" <= "quantity" AND "receivedQty" <= "quantity"));

-- نسخة الكتاب لا تُعار مرتين في الوقت نفسه
CREATE UNIQUE INDEX library_one_open_loan ON "LibraryLoan" ("copyId") WHERE "returnedAt" IS NULL;

-- الموازنة والمبيعات بمبالغ غير سالبة
ALTER TABLE "BudgetLine" ADD CONSTRAINT budget_line_non_negative CHECK ("amountMinor" >= 0);
ALTER TABLE "Sale" ADD CONSTRAINT sale_amounts_valid CHECK ("totalMinor" >= 0 AND "taxMinor" >= 0 AND "costMinor" >= 0);
