-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('BHD', 'USD', 'EUR', 'GBP', 'SAR', 'AED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'STAFF');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('VOYAGEUR', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('AIRLINE', 'HOTEL', 'DMC', 'TRANSPORT', 'VISA_AGENT');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('PREPAID', 'CREDIT');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('NONE', 'FIXED_PERCENT', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'DISPUTED');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('FLIGHT', 'HOTEL', 'PACKAGE', 'VISA', 'TRANSPORT', 'GROUP_ADVENTURE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('INQUIRY', 'CONFIRMED', 'TICKETED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM ('UNPAID', 'DEPOSIT_PAID', 'FULLY_PAID');

-- CreateEnum
CREATE TYPE "BoardBasis" AS ENUM ('RO', 'BB', 'HB', 'FB');

-- CreateEnum
CREATE TYPE "VisaProcessingStatus" AS ENUM ('NOT_STARTED', 'DOCUMENTS_PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ISSUED');

-- CreateEnum
CREATE TYPE "TransportKind" AS ENUM ('AIRPORT_TRANSFER', 'CAR_RENTAL', 'INTER_CITY');

-- CreateEnum
CREATE TYPE "PackageComponentKind" AS ENUM ('FLIGHT', 'HOTEL', 'TRANSPORT', 'ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "TravelerType" AS ENUM ('ADULT', 'CHILD', 'INFANT');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('TICKET', 'VOUCHER', 'VISA_COPY', 'PASSPORT_COPY', 'INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "ScheduleItemKind" AS ENUM ('DEPOSIT', 'BALANCE', 'INSTALLMENT');

-- CreateEnum
CREATE TYPE "ScheduleItemStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DepartureStatus" AS ENUM ('DRAFT', 'OPEN', 'FULL', 'CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceLanguage" AS ENUM ('EN', 'AR', 'BILINGUAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'BENEFIT_PAY', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('BOOKING_CONFIRMED', 'BALANCE_DUE_REMINDER', 'MEMBERSHIP_RENEWAL_REMINDER', 'GROUP_CAPACITY_ALERT');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('UNKNOWN', 'ACCEPTED', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationRecipient" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "baseCurrency" "Currency" NOT NULL,
    "quoteCurrency" "Currency" NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "whatsappPhone" TEXT,
    "nationality" TEXT,
    "customerType" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "passportNumber" TEXT,
    "passportExpiry" DATE,
    "companyName" TEXT,
    "crNumber" TEXT,
    "billingContact" TEXT,
    "billingEmail" TEXT,
    "agreedRateNote" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "membershipNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL DEFAULT 'VOYAGEUR',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATE NOT NULL,
    "expiryDate" DATE NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "groupBookingPriority" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_renewals" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'BHD',
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "country" TEXT,
    "paymentTerms" "PaymentTerms" NOT NULL DEFAULT 'PREPAID',
    "creditDays" INTEGER,
    "commissionType" "CommissionType" NOT NULL DEFAULT 'NONE',
    "commissionValue" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "defaultCurrency" "Currency" NOT NULL DEFAULT 'BHD',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_rate_sheets" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "currency" "Currency" NOT NULL DEFAULT 'BHD',
    "notes" TEXT,
    "fileKey" TEXT,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_rate_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "amount" DECIMAL(18,3) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'BHD',
    "fxRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amountBase" DECIMAL(18,3) NOT NULL,
    "paidAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "disputeNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoice_bookings" (
    "supplierInvoiceId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "supplier_invoice_bookings_pkey" PRIMARY KEY ("supplierInvoiceId","bookingId")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "BookingType" NOT NULL,
    "supplierId" TEXT,
    "supplierRateSheetId" TEXT,
    "departureDate" DATE,
    "returnDate" DATE,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "costCurrency" "Currency" NOT NULL DEFAULT 'BHD',
    "fxRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "costAmountBase" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "sellingAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "membershipDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "membershipDiscountAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "netSellingAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "marginAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "status" "BookingStatus" NOT NULL DEFAULT 'INQUIRY',
    "paymentStatus" "BookingPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "depositType" "DepositType" DEFAULT 'PERCENT',
    "depositValue" DECIMAL(18,3),
    "balanceDueDate" DATE,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_details" (
    "bookingId" TEXT NOT NULL,
    "airline" TEXT NOT NULL,
    "pnr" TEXT,
    "routeFrom" TEXT NOT NULL,
    "routeTo" TEXT NOT NULL,
    "returnRouteFrom" TEXT,
    "returnRouteTo" TEXT,
    "cabinClass" TEXT,
    "baggageAllowance" TEXT,
    "ticketNumbers" TEXT,

    CONSTRAINT "flight_details_pkey" PRIMARY KEY ("bookingId")
);

-- CreateTable
CREATE TABLE "hotel_details" (
    "bookingId" TEXT NOT NULL,
    "propertyName" TEXT NOT NULL,
    "city" TEXT,
    "roomType" TEXT,
    "boardBasis" "BoardBasis" NOT NULL DEFAULT 'RO',
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "confirmationNumber" TEXT,

    CONSTRAINT "hotel_details_pkey" PRIMARY KEY ("bookingId")
);

-- CreateTable
CREATE TABLE "visa_details" (
    "bookingId" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "visaType" TEXT NOT NULL,
    "processingStatus" "VisaProcessingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "applicationNumber" TEXT,
    "submittedAt" DATE,
    "decisionAt" DATE,

    CONSTRAINT "visa_details_pkey" PRIMARY KEY ("bookingId")
);

-- CreateTable
CREATE TABLE "transport_details" (
    "bookingId" TEXT NOT NULL,
    "kind" "TransportKind" NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "dropoffLocation" TEXT,
    "pickupAt" TIMESTAMP(3),
    "vehicleType" TEXT,
    "returnAt" TIMESTAMP(3),
    "driverRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "transport_details_pkey" PRIMARY KEY ("bookingId")
);

-- CreateTable
CREATE TABLE "package_components" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "PackageComponentKind" NOT NULL,
    "description" TEXT NOT NULL,
    "supplierId" TEXT,
    "costAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "costCurrency" "Currency" NOT NULL DEFAULT 'BHD',
    "fxRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "costAmountBase" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "startDate" DATE,
    "endDate" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "package_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travelers" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerId" TEXT,
    "fullName" TEXT NOT NULL,
    "type" "TravelerType" NOT NULL DEFAULT 'ADULT',
    "passportNumber" TEXT,
    "passportExpiry" DATE,
    "nationality" TEXT,
    "dateOfBirth" DATE,
    "phone" TEXT,
    "singleSupplement" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travelers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_attachments" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'OTHER',
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_schedule_items" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "ScheduleItemKind" NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(18,3) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "ScheduleItemStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_trip_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT,
    "summary" TEXT,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_trip_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_itinerary_days" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "departureId" TEXT,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "group_itinerary_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_departures" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "destination" TEXT,
    "departureDate" DATE NOT NULL,
    "returnDate" DATE,
    "capacity" INTEGER NOT NULL,
    "seatsBooked" INTEGER NOT NULL DEFAULT 0,
    "pricePerSeat" DECIMAL(18,3) NOT NULL,
    "singleSupplement" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'BHD',
    "status" "DepartureStatus" NOT NULL DEFAULT 'DRAFT',
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tourLeaderName" TEXT,
    "notes" TEXT,
    "lastCapacityAlertPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_departures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_adventure_details" (
    "bookingId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "singleSupplementSeats" INTEGER NOT NULL DEFAULT 0,
    "pricePerSeat" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "group_adventure_details_pkey" PRIMARY KEY ("bookingId")
);

-- CreateTable
CREATE TABLE "group_waitlist_entries" (
    "id" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestedSeats" INTEGER NOT NULL DEFAULT 1,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "offeredAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "language" "InvoiceLanguage" NOT NULL DEFAULT 'EN',
    "currency" "Currency" NOT NULL DEFAULT 'BHD',
    "subtotal" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "notesAr" TEXT,
    "terms" TEXT,
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "bookingId" TEXT,
    "description" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "lineTotal" DECIMAL(18,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "membershipId" TEXT,
    "amount" DECIMAL(18,3) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'BHD',
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "scheduleItemId" TEXT,
    "amount" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" DECIMAL(18,3) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'BHD',
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reference" TEXT,
    "processedAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "key" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "name" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyAr" TEXT,
    "metaTemplateName" TEXT,
    "metaLanguageCode" TEXT NOT NULL DEFAULT 'en',
    "variables" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "recipientType" "NotificationRecipient" NOT NULL DEFAULT 'CUSTOMER',
    "toPhone" TEXT NOT NULL,
    "customerId" TEXT,
    "bookingId" TEXT,
    "membershipId" TEXT,
    "departureId" TEXT,
    "scheduleItemId" TEXT,
    "variables" JSONB NOT NULL,
    "renderedBodyEn" TEXT NOT NULL,
    "renderedBodyAr" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'UNKNOWN',
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "provider" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentManually" BOOLEAN NOT NULL DEFAULT false,
    "sentById" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_baseCurrency_quoteCurrency_effectiveOn_key" ON "exchange_rates"("baseCurrency", "quoteCurrency", "effectiveOn");

-- CreateIndex
CREATE INDEX "customers_fullName_idx" ON "customers"("fullName");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_passportExpiry_idx" ON "customers"("passportExpiry");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_membershipNumber_key" ON "memberships"("membershipNumber");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_customerId_key" ON "memberships"("customerId");

-- CreateIndex
CREATE INDEX "memberships_status_expiryDate_idx" ON "memberships"("status", "expiryDate");

-- CreateIndex
CREATE INDEX "membership_renewals_membershipId_idx" ON "membership_renewals"("membershipId");

-- CreateIndex
CREATE INDEX "suppliers_type_idx" ON "suppliers"("type");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "supplier_rate_sheets_supplierId_effectiveFrom_idx" ON "supplier_rate_sheets"("supplierId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_rate_sheets_supplierId_version_key" ON "supplier_rate_sheets"("supplierId", "version");

-- CreateIndex
CREATE INDEX "supplier_invoices_status_dueDate_idx" ON "supplier_invoices"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_supplierId_reference_key" ON "supplier_invoices"("supplierId", "reference");

-- CreateIndex
CREATE INDEX "supplier_invoice_bookings_bookingId_idx" ON "supplier_invoice_bookings"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings"("reference");

-- CreateIndex
CREATE INDEX "bookings_customerId_idx" ON "bookings"("customerId");

-- CreateIndex
CREATE INDEX "bookings_supplierId_idx" ON "bookings"("supplierId");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_paymentStatus_idx" ON "bookings"("paymentStatus");

-- CreateIndex
CREATE INDEX "bookings_departureDate_idx" ON "bookings"("departureDate");

-- CreateIndex
CREATE INDEX "bookings_type_idx" ON "bookings"("type");

-- CreateIndex
CREATE INDEX "flight_details_pnr_idx" ON "flight_details"("pnr");

-- CreateIndex
CREATE INDEX "package_components_bookingId_idx" ON "package_components"("bookingId");

-- CreateIndex
CREATE INDEX "travelers_bookingId_idx" ON "travelers"("bookingId");

-- CreateIndex
CREATE INDEX "travelers_customerId_idx" ON "travelers"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_attachments_fileKey_key" ON "booking_attachments"("fileKey");

-- CreateIndex
CREATE INDEX "booking_attachments_bookingId_idx" ON "booking_attachments"("bookingId");

-- CreateIndex
CREATE INDEX "payment_schedule_items_bookingId_idx" ON "payment_schedule_items"("bookingId");

-- CreateIndex
CREATE INDEX "payment_schedule_items_status_dueDate_idx" ON "payment_schedule_items"("status", "dueDate");

-- CreateIndex
CREATE INDEX "group_itinerary_days_templateId_dayNumber_idx" ON "group_itinerary_days"("templateId", "dayNumber");

-- CreateIndex
CREATE INDEX "group_itinerary_days_departureId_dayNumber_idx" ON "group_itinerary_days"("departureId", "dayNumber");

-- CreateIndex
CREATE INDEX "group_departures_departureDate_idx" ON "group_departures"("departureDate");

-- CreateIndex
CREATE INDEX "group_departures_status_idx" ON "group_departures"("status");

-- CreateIndex
CREATE INDEX "group_adventure_details_departureId_idx" ON "group_adventure_details"("departureId");

-- CreateIndex
CREATE INDEX "group_waitlist_entries_departureId_status_idx" ON "group_waitlist_entries"("departureId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "group_waitlist_entries_departureId_customerId_key" ON "group_waitlist_entries"("departureId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_customerId_idx" ON "invoices"("customerId");

-- CreateIndex
CREATE INDEX "invoices_status_dueDate_idx" ON "invoices"("status", "dueDate");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_lines_bookingId_idx" ON "invoice_lines"("bookingId");

-- CreateIndex
CREATE INDEX "payments_customerId_idx" ON "payments"("customerId");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_bookingId_idx" ON "payment_allocations"("bookingId");

-- CreateIndex
CREATE INDEX "payment_allocations_scheduleItemId_idx" ON "payment_allocations"("scheduleItemId");

-- CreateIndex
CREATE INDEX "refunds_bookingId_idx" ON "refunds"("bookingId");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_dedupeKey_key" ON "notification_outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_outbox_status_scheduledFor_idx" ON "notification_outbox"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "notification_outbox_event_idx" ON "notification_outbox"("event");

-- CreateIndex
CREATE INDEX "notification_outbox_customerId_idx" ON "notification_outbox"("customerId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_renewals" ADD CONSTRAINT "membership_renewals_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_renewals" ADD CONSTRAINT "membership_renewals_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rate_sheets" ADD CONSTRAINT "supplier_rate_sheets_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_bookings" ADD CONSTRAINT "supplier_invoice_bookings_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_bookings" ADD CONSTRAINT "supplier_invoice_bookings_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_supplierRateSheetId_fkey" FOREIGN KEY ("supplierRateSheetId") REFERENCES "supplier_rate_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_details" ADD CONSTRAINT "flight_details_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_details" ADD CONSTRAINT "hotel_details_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_details" ADD CONSTRAINT "visa_details_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_details" ADD CONSTRAINT "transport_details_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_attachments" ADD CONSTRAINT "booking_attachments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_attachments" ADD CONSTRAINT "booking_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedule_items" ADD CONSTRAINT "payment_schedule_items_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_itinerary_days" ADD CONSTRAINT "group_itinerary_days_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "group_trip_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_itinerary_days" ADD CONSTRAINT "group_itinerary_days_departureId_fkey" FOREIGN KEY ("departureId") REFERENCES "group_departures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_departures" ADD CONSTRAINT "group_departures_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "group_trip_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_adventure_details" ADD CONSTRAINT "group_adventure_details_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_adventure_details" ADD CONSTRAINT "group_adventure_details_departureId_fkey" FOREIGN KEY ("departureId") REFERENCES "group_departures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_waitlist_entries" ADD CONSTRAINT "group_waitlist_entries_departureId_fkey" FOREIGN KEY ("departureId") REFERENCES "group_departures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_waitlist_entries" ADD CONSTRAINT "group_waitlist_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "payment_schedule_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_templateKey_fkey" FOREIGN KEY ("templateKey") REFERENCES "notification_templates"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_departureId_fkey" FOREIGN KEY ("departureId") REFERENCES "group_departures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "payment_schedule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
