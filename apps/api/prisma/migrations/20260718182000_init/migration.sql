CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "DocumentStatus" AS ENUM (
  'DRAFT',
  'PENDING',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "DataScope" AS ENUM ('ALL', 'DEPARTMENT', 'PERSONAL');

CREATE TABLE "documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type_id" VARCHAR(64) NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "master_data" JSONB NOT NULL,
  "detail_tables" JSONB NOT NULL,
  "search_text" TEXT NOT NULL DEFAULT '',
  "source_document_id" UUID,
  "source_type_id" VARCHAR(64),
  "source_code" VARCHAR(64),
  "created_by" VARCHAR(100) NOT NULL,
  "created_by_id" VARCHAR(64) NOT NULL,
  "department_id" VARCHAR(64),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_permission_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(64) NOT NULL,
  "type_id" VARCHAR(64) NOT NULL,
  "scope" "DataScope" NOT NULL DEFAULT 'PERSONAL',
  "extra_department_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "extra_user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "data_permission_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_preferences" (
  "user_id" VARCHAR(64) NOT NULL,
  "settings" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "user_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(64) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "content" VARCHAR(500) NOT NULL,
  "level" VARCHAR(20) NOT NULL DEFAULT 'info',
  "target" JSONB,
  "read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_menus" (
  "id" VARCHAR(80) NOT NULL,
  "group_id" VARCHAR(64) NOT NULL,
  "group_label" VARCHAR(80) NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "icon" VARCHAR(60) NOT NULL DEFAULT 'FileText',
  "target" VARCHAR(40) NOT NULL,
  "target_id" VARCHAR(80),
  "permission_code" VARCHAR(100),
  "order" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "system_menus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "description" VARCHAR(300),
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_users" (
  "id" VARCHAR(64) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "email" VARCHAR(160),
  "department_id" VARCHAR(64),
  "department_name" VARCHAR(100),
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_roles" (
  "user_id" VARCHAR(64) NOT NULL,
  "role_id" UUID NOT NULL,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role_id")
);

CREATE TABLE "activity_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "operator" VARCHAR(100) NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_sequences" (
  "type_id" VARCHAR(64) NOT NULL,
  "period" CHAR(6) NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("type_id", "period")
);

CREATE UNIQUE INDEX "documents_code_key" ON "documents"("code");
CREATE UNIQUE INDEX "documents_source_document_id_type_id_key" ON "documents"("source_document_id", "type_id");
CREATE INDEX "documents_type_id_status_idx" ON "documents"("type_id", "status");
CREATE INDEX "documents_updated_at_idx" ON "documents"("updated_at");
CREATE INDEX "documents_type_id_updated_at_idx" ON "documents"("type_id", "updated_at");
CREATE INDEX "activity_records_document_id_created_at_idx" ON "activity_records"("document_id", "created_at");
CREATE UNIQUE INDEX "data_permission_policies_user_id_type_id_key" ON "data_permission_policies"("user_id", "type_id");
CREATE INDEX "data_permission_policies_user_id_idx" ON "data_permission_policies"("user_id");
CREATE INDEX "user_notifications_user_id_read_at_created_at_idx" ON "user_notifications"("user_id", "read_at", "created_at");
CREATE INDEX "system_menus_group_id_order_idx" ON "system_menus"("group_id", "order");
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE INDEX "app_users_status_idx" ON "app_users"("status");
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_source_document_id_fkey"
  FOREIGN KEY ("source_document_id") REFERENCES "documents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_records"
  ADD CONSTRAINT "activity_records_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
