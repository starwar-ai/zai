CREATE TYPE "DeclarationNameMappingStatus" AS ENUM ('PENDING', 'GENERATING', 'APPROVED', 'REVIEW_REQUIRED', 'REJECTED', 'FAILED');
CREATE TYPE "DeclarationNameJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "DeclarationNameJobItemStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "declaration_name_mappings" (
  "id" UUID NOT NULL,
  "normalized_name" VARCHAR(255) NOT NULL,
  "normalized_name_eng" VARCHAR(255) NOT NULL,
  "raw_name" VARCHAR(255) NOT NULL,
  "raw_name_eng" VARCHAR(255) NOT NULL,
  "row_count" INTEGER NOT NULL DEFAULT 0,
  "existing_declaration_variants" TEXT,
  "existing_eng_variants" TEXT,
  "declaration_name" VARCHAR(100),
  "customs_declaration_name_eng" VARCHAR(100),
  "confidence" DECIMAL(4,3),
  "review_required" BOOLEAN NOT NULL DEFAULT true,
  "review_reason" VARCHAR(500),
  "status" "DeclarationNameMappingStatus" NOT NULL DEFAULT 'PENDING',
  "source" VARCHAR(50) NOT NULL DEFAULT 'api',
  "prompt_version" VARCHAR(50),
  "model_version" VARCHAR(100),
  "approved_by" VARCHAR(100),
  "approved_at" TIMESTAMPTZ(3),
  "rejected_by" VARCHAR(100),
  "rejected_at" TIMESTAMPTZ(3),
  "reject_reason" VARCHAR(500),
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "declaration_name_mappings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "declaration_name_mappings_normalized_name_normalized_name_eng_key" ON "declaration_name_mappings"("normalized_name", "normalized_name_eng");
CREATE INDEX "declaration_name_mappings_status_updated_at_idx" ON "declaration_name_mappings"("status", "updated_at");
CREATE INDEX "declaration_name_mappings_review_required_status_idx" ON "declaration_name_mappings"("review_required", "status");

CREATE TABLE "declaration_name_generation_jobs" (
  "id" UUID NOT NULL,
  "status" "DeclarationNameJobStatus" NOT NULL DEFAULT 'PENDING',
  "input_count" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "review_count" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "created_by" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "declaration_name_generation_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "declaration_name_generation_jobs_created_by_created_at_idx" ON "declaration_name_generation_jobs"("created_by", "created_at");

CREATE TABLE "declaration_name_generation_job_items" (
  "id" UUID NOT NULL,
  "job_id" UUID NOT NULL,
  "mapping_id" UUID NOT NULL,
  "status" "DeclarationNameJobItemStatus" NOT NULL DEFAULT 'PENDING',
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "declaration_name_generation_job_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "declaration_name_generation_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "declaration_name_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "declaration_name_generation_job_items_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES "declaration_name_mappings"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "declaration_name_generation_job_items_job_id_mapping_id_key" ON "declaration_name_generation_job_items"("job_id", "mapping_id");
CREATE INDEX "declaration_name_generation_job_items_job_id_status_idx" ON "declaration_name_generation_job_items"("job_id", "status");

CREATE TABLE "declaration_name_source_items" (
  "id" UUID NOT NULL,
  "source_type" VARCHAR(30) NOT NULL,
  "source_item_id" VARCHAR(100) NOT NULL,
  "raw_name" VARCHAR(255) NOT NULL,
  "raw_name_eng" VARCHAR(255) NOT NULL,
  "normalized_name" VARCHAR(255) NOT NULL,
  "normalized_name_eng" VARCHAR(255) NOT NULL,
  "declaration_name" VARCHAR(100),
  "customs_declaration_name_eng" VARCHAR(100),
  "mapping_id" UUID,
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "declaration_name_source_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "declaration_name_source_items_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES "declaration_name_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "declaration_name_source_items_source_type_source_item_id_key" ON "declaration_name_source_items"("source_type", "source_item_id");
CREATE INDEX "declaration_name_source_items_normalized_name_normalized_name_eng_idx" ON "declaration_name_source_items"("normalized_name", "normalized_name_eng");

CREATE TABLE "declaration_name_audit_logs" (
  "id" UUID NOT NULL,
  "mapping_id" UUID,
  "action" VARCHAR(50) NOT NULL,
  "actor" VARCHAR(100) NOT NULL,
  "before_json" JSONB,
  "after_json" JSONB,
  "note" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "declaration_name_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "declaration_name_audit_logs_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES "declaration_name_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "declaration_name_audit_logs_mapping_id_created_at_idx" ON "declaration_name_audit_logs"("mapping_id", "created_at");
