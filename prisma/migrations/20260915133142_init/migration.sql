-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('Pending', 'ReadyForPickup', 'Assigned', 'PickedUp', 'InTransit', 'OutForDelivery', 'Failed', 'ReturnInProgress', 'Delivered', 'Cancelled', 'Returned');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('Offered', 'Accepted', 'Rejected', 'Expired', 'Withdrawn', 'Released', 'Completed');

-- CreateEnum
CREATE TYPE "DriverAvailabilityState" AS ENUM ('Offline', 'Available', 'Assigned', 'OnDelivery', 'Unavailable');

-- CreateEnum
CREATE TYPE "UserAccountStatus" AS ENUM ('Invited', 'Active', 'Inactive', 'Suspended');

-- CreateEnum
CREATE TYPE "VehicleOperationalStatus" AS ENUM ('Active', 'Maintenance', 'Inactive');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('Uploaded', 'Scanning', 'Accepted', 'Rejected', 'FailedProcessing');

-- CreateEnum
CREATE TYPE "ProofEvidenceType" AS ENUM ('RecipientName', 'Photo', 'Signature', 'ConfirmationFlag', 'Otp');

-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('Pending', 'Accepted', 'Rejected');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('InApp', 'Email');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('Pending', 'Sent', 'Failed', 'DeadLettered');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('Pending', 'Sent', 'Failed', 'DeadLettered');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('Pending', 'Processing', 'Delivered', 'Failed', 'DeadLettered');

-- CreateEnum
CREATE TYPE "CustodyKind" AS ENUM ('Driver', 'Facility');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('InProgress', 'Delivered', 'Failed');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('InProgress', 'Returned');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('InProgress', 'Completed', 'Conflict');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('ProofOfDelivery', 'ReturnReceipt');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "status" "UserAccountStatus" NOT NULL DEFAULT 'Invited',
    "invitationTokenHash" TEXT,
    "invitationExpiresAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretCipher" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenFamilyId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "reusedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "accountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "driverCode" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "qualification" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "state" "DriverAvailabilityState" NOT NULL DEFAULT 'Offline',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_availability_history" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "previousState" "DriverAvailabilityState" NOT NULL,
    "newState" "DriverAvailabilityState" NOT NULL,
    "reasonCode" TEXT,
    "actorId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_availability_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "vehicleType" TEXT NOT NULL,
    "capacityValue" DECIMAL(12,2) NOT NULL,
    "capacityUnit" TEXT NOT NULL,
    "status" "VehicleOperationalStatus" NOT NULL DEFAULT 'Active',
    "qualification" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_vehicle_assignments" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "assignedFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedTo" TIMESTAMP(3),
    "reasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_vehicle_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(12,2),
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_areas" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "radiusMeters" DECIMAL(12,2),
    "polygon" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_zones" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_policy_versions" (
    "id" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiresRecipientName" BOOLEAN NOT NULL DEFAULT true,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT true,
    "requiresSignature" BOOLEAN NOT NULL DEFAULT false,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "requiresOtp" BOOLEAN NOT NULL DEFAULT false,
    "minPhotos" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'Pending',
    "customerId" TEXT NOT NULL,
    "serviceTypeId" TEXT,
    "proofPolicyId" TEXT,
    "zoneId" TEXT,
    "createdById" TEXT,
    "pickupAddress" JSONB NOT NULL,
    "deliveryAddress" JSONB NOT NULL,
    "pickupInstructions" TEXT,
    "deliveryInstructions" TEXT,
    "promisedAtStart" TIMESTAMP(3),
    "promisedAtEnd" TIMESTAMP(3),
    "rescheduledAtStart" TIMESTAMP(3),
    "rescheduledAtEnd" TIMESTAMP(3),
    "deliveryFee" DECIMAL(12,2),
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "packageNote" TEXT,
    "pickupPhotoRequired" BOOLEAN,
    "readyAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "weight" DECIMAL(12,3),
    "weightUnit" TEXT,
    "lengthCm" DECIMAL(12,2),
    "widthCm" DECIMAL(12,2),
    "heightCm" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_assignments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'Offered',
    "assignedById" TEXT,
    "offerExpiresAt" TIMESTAMP(3),
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus" NOT NULL,
    "toStatus" "OrderStatus" NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "requestId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'InProgress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "failureReasonId" TEXT,
    "failureReasonText" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_failure_reasons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "requiresText" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_failure_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reschedule_records" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "previousStart" TIMESTAMP(3) NOT NULL,
    "previousEnd" TIMESTAMP(3) NOT NULL,
    "newStart" TIMESTAMP(3) NOT NULL,
    "newEnd" TIMESTAMP(3) NOT NULL,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reschedule_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromKind" "CustodyKind",
    "fromHolderId" TEXT,
    "toKind" "CustodyKind" NOT NULL,
    "toHolderId" TEXT NOT NULL,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "actorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_records" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptId" TEXT,
    "status" "ReturnStatus" NOT NULL DEFAULT 'InProgress',
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "initiatedById" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "evidenceId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_proofs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "evidenceType" "ProofEvidenceType" NOT NULL,
    "evidenceValue" TEXT,
    "confirmationFlag" BOOLEAN,
    "status" "ProofStatus" NOT NULL DEFAULT 'Pending',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctedById" TEXT,
    "correctedAt" TIMESTAMP(3),
    "correctedFromId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" TEXT,

    CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "attemptId" TEXT,
    "provider" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'Uploaded',
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedAt" TIMESTAMP(3),
    "scanResult" TEXT,
    "expiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "purpose" "OtpPurpose" NOT NULL,
    "identifier" TEXT NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptsLeft" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMP(3),
    "resentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_locations" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracyMeters" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_notes" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'InApp',
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'Pending',
    "providerRef" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAfter" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "traceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'InProgress',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "requestId" TEXT,
    "ip" TEXT,
    "result" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_invitationTokenHash_key" ON "users"("invitationTokenHash");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_tokenFamilyId_idx" ON "sessions"("tokenFamilyId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_credentials_tokenHash_key" ON "refresh_credentials"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_credentials_userId_idx" ON "refresh_credentials"("userId");

-- CreateIndex
CREATE INDEX "refresh_credentials_familyId_idx" ON "refresh_credentials"("familyId");

-- CreateIndex
CREATE INDEX "refresh_credentials_revokedAt_idx" ON "refresh_credentials"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_emailNormalized_key" ON "customers"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phoneNormalized_key" ON "customers"("phoneNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "customers_accountId_key" ON "customers"("accountId");

-- CreateIndex
CREATE INDEX "customers_createdAt_idx" ON "customers"("createdAt");

-- CreateIndex
CREATE INDEX "customer_addresses_customerId_idx" ON "customer_addresses"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_driverCode_key" ON "drivers"("driverCode");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_accountId_key" ON "drivers"("accountId");

-- CreateIndex
CREATE INDEX "drivers_active_idx" ON "drivers"("active");

-- CreateIndex
CREATE INDEX "drivers_state_idx" ON "drivers"("state");

-- CreateIndex
CREATE INDEX "driver_availability_history_driverId_changedAt_idx" ON "driver_availability_history"("driverId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_registrationNumber_key" ON "vehicles"("registrationNumber");

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE INDEX "driver_vehicle_assignments_driverId_assignedFrom_idx" ON "driver_vehicle_assignments"("driverId", "assignedFrom");

-- CreateIndex
CREATE INDEX "driver_vehicle_assignments_vehicleId_assignedFrom_idx" ON "driver_vehicle_assignments"("vehicleId", "assignedFrom");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_name_key" ON "delivery_zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_code_key" ON "delivery_zones"("code");

-- CreateIndex
CREATE INDEX "delivery_zones_active_idx" ON "delivery_zones"("active");

-- CreateIndex
CREATE INDEX "zone_areas_zoneId_idx" ON "zone_areas"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_zones_driverId_zoneId_key" ON "driver_zones"("driverId", "zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "service_types_code_key" ON "service_types"("code");

-- CreateIndex
CREATE INDEX "service_types_active_idx" ON "service_types"("active");

-- CreateIndex
CREATE UNIQUE INDEX "proof_policy_versions_policyVersion_key" ON "proof_policy_versions"("policyVersion");

-- CreateIndex
CREATE INDEX "proof_policy_versions_active_idx" ON "proof_policy_versions"("active");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_orders_orderNumber_key" ON "delivery_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "delivery_orders_customerId_idx" ON "delivery_orders"("customerId");

-- CreateIndex
CREATE INDEX "delivery_orders_status_createdAt_idx" ON "delivery_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_orders_createdAt_idx" ON "delivery_orders"("createdAt");

-- CreateIndex
CREATE INDEX "delivery_items_orderId_idx" ON "delivery_items"("orderId");

-- CreateIndex
CREATE INDEX "delivery_assignments_orderId_status_idx" ON "delivery_assignments"("orderId", "status");

-- CreateIndex
CREATE INDEX "delivery_assignments_driverId_status_idx" ON "delivery_assignments"("driverId", "status");

-- CreateIndex
CREATE INDEX "delivery_assignments_status_offerExpiresAt_idx" ON "delivery_assignments"("status", "offerExpiresAt");

-- CreateIndex
CREATE INDEX "delivery_assignments_offeredAt_idx" ON "delivery_assignments"("offeredAt");

-- CreateIndex
CREATE INDEX "delivery_status_history_orderId_createdAt_idx" ON "delivery_status_history"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_attempts_orderId_status_idx" ON "delivery_attempts"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_orderId_attemptNumber_key" ON "delivery_attempts"("orderId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_failure_reasons_code_key" ON "delivery_failure_reasons"("code");

-- CreateIndex
CREATE INDEX "delivery_failure_reasons_active_idx" ON "delivery_failure_reasons"("active");

-- CreateIndex
CREATE INDEX "reschedule_records_orderId_createdAt_idx" ON "reschedule_records"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "custody_events_orderId_occurredAt_idx" ON "custody_events"("orderId", "occurredAt");

-- CreateIndex
CREATE INDEX "return_records_orderId_idx" ON "return_records"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_proofs_fileId_key" ON "delivery_proofs"("fileId");

-- CreateIndex
CREATE INDEX "delivery_proofs_orderId_status_idx" ON "delivery_proofs"("orderId", "status");

-- CreateIndex
CREATE INDEX "delivery_proofs_attemptId_idx" ON "delivery_proofs"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_key_key" ON "file_objects"("key");

-- CreateIndex
CREATE INDEX "file_objects_orderId_status_idx" ON "file_objects"("orderId", "status");

-- CreateIndex
CREATE INDEX "file_objects_status_uploadedAt_idx" ON "file_objects"("status", "uploadedAt");

-- CreateIndex
CREATE INDEX "file_objects_expiresAt_idx" ON "file_objects"("expiresAt");

-- CreateIndex
CREATE INDEX "otp_challenges_orderId_purpose_idx" ON "otp_challenges"("orderId", "purpose");

-- CreateIndex
CREATE INDEX "otp_challenges_identifier_purpose_idx" ON "otp_challenges"("identifier", "purpose");

-- CreateIndex
CREATE INDEX "driver_locations_driverId_capturedAt_idx" ON "driver_locations"("driverId", "capturedAt");

-- CreateIndex
CREATE INDEX "driver_locations_receivedAt_idx" ON "driver_locations"("receivedAt");

-- CreateIndex
CREATE INDEX "internal_notes_orderId_createdAt_idx" ON "internal_notes"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_orderId_idx" ON "notifications"("orderId");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_nextRetryAt_idx" ON "notification_deliveries"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_notificationId_idx" ON "notification_deliveries"("notificationId");

-- CreateIndex
CREATE INDEX "outbox_events_status_availableAfter_idx" ON "outbox_events"("status", "availableAfter");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateType_aggregateId_idx" ON "outbox_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scopeKey_operation_key_key" ON "idempotency_records"("scopeKey", "operation", "key");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_occurredAt_idx" ON "audit_logs"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_occurredAt_idx" ON "audit_logs"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_credentials" ADD CONSTRAINT "refresh_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_availability_history" ADD CONSTRAINT "driver_availability_history_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle_assignments" ADD CONSTRAINT "driver_vehicle_assignments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle_assignments" ADD CONSTRAINT "driver_vehicle_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_areas" ADD CONSTRAINT "zone_areas_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_zones" ADD CONSTRAINT "driver_zones_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_zones" ADD CONSTRAINT "driver_zones_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_proofPolicyId_fkey" FOREIGN KEY ("proofPolicyId") REFERENCES "proof_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_failureReasonId_fkey" FOREIGN KEY ("failureReasonId") REFERENCES "delivery_failure_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reschedule_records" ADD CONSTRAINT "reschedule_records_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "delivery_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "delivery_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "delivery_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
