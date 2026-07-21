CREATE TABLE "ocr_recognitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(64) NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(50) NOT NULL,
  "image_data" BYTEA NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'RECOGNIZING',
  "platform" VARCHAR(80),
  "order_no" VARCHAR(160),
  "product_name" VARCHAR(500),
  "amount" VARCHAR(80),
  "payment_time" VARCHAR(100),
  "payment_status" VARCHAR(100),
  "payment_method" VARCHAR(100),
  "receiver" VARCHAR(255),
  "raw_json" JSONB,
  "model" VARCHAR(100),
  "error_message" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ocr_recognitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ocr_recognitions_user_id_created_at_idx" ON "ocr_recognitions"("user_id", "created_at");
CREATE INDEX "ocr_recognitions_user_id_status_idx" ON "ocr_recognitions"("user_id", "status");
