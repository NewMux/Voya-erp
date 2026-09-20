-- Phase 1 change requests: companions, visa reference data, partner offers,
-- customer documents, group-adventure trip-level cost, configurable
-- membership renewal periods.

-- AlterEnum
ALTER TYPE "AttachmentKind" ADD VALUE 'PHOTO';

-- CreateEnum
CREATE TYPE "RenewalUnit" AS ENUM ('DAY', 'MONTH', 'YEAR');

-- AlterTable
ALTER TABLE "memberships"
  ADD COLUMN "renewalUnit" "RenewalUnit" NOT NULL DEFAULT 'YEAR',
  ADD COLUMN "renewalValue" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "group_departures"
  ADD COLUMN "costPerSeat" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "costCurrency" "Currency" NOT NULL DEFAULT 'BHD',
  ADD COLUMN "costFxRate" DECIMAL(18,6) NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "companions" (
    "id" TEXT NOT NULL,
    "primaryCustomerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT,
    "dateOfBirth" DATE,
    "passportNumber" TEXT,
    "passportExpiry" DATE,
    "nationality" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "travelers" ADD COLUMN "companionId" TEXT;

-- CreateTable
CREATE TABLE "customer_attachments" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'OTHER',
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visa_country_references" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "embassyName" TEXT,
    "visaFeeAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "visaFeeCurrency" "Currency" NOT NULL DEFAULT 'BHD',
    "requiredDocuments" TEXT,
    "termsAndConditions" TEXT,
    "processingTimeDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visa_country_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_offers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoFileKey" TEXT,
    "country" TEXT,
    "description" TEXT NOT NULL,
    "termsAndConditions" TEXT,
    "agreementStart" DATE NOT NULL,
    "agreementEnd" DATE NOT NULL,
    "agreementDocumentFileKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companions_primaryCustomerId_idx" ON "companions"("primaryCustomerId");

-- CreateIndex
CREATE INDEX "travelers_companionId_idx" ON "travelers"("companionId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_attachments_fileKey_key" ON "customer_attachments"("fileKey");

-- CreateIndex
CREATE INDEX "customer_attachments_customerId_idx" ON "customer_attachments"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "visa_country_references_country_key" ON "visa_country_references"("country");

-- CreateIndex
CREATE INDEX "partner_offers_isActive_agreementEnd_idx" ON "partner_offers"("isActive", "agreementEnd");

-- AddForeignKey
ALTER TABLE "companions" ADD CONSTRAINT "companions_primaryCustomerId_fkey" FOREIGN KEY ("primaryCustomerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_companionId_fkey" FOREIGN KEY ("companionId") REFERENCES "companions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_attachments" ADD CONSTRAINT "customer_attachments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_attachments" ADD CONSTRAINT "customer_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
