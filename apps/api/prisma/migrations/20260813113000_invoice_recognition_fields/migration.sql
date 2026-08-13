ALTER TABLE "ocr_recognitions"
  ADD COLUMN "recognition_type" VARCHAR(20) NOT NULL DEFAULT 'PAYMENT',
  ADD COLUMN "extraction_method" VARCHAR(20),
  ADD COLUMN "qr_raw_text" VARCHAR(1000),
  ADD COLUMN "invoice_number" VARCHAR(100),
  ADD COLUMN "invoice_date" VARCHAR(100),
  ADD COLUMN "buyer_name" VARCHAR(255),
  ADD COLUMN "buyer_tax_id" VARCHAR(100),
  ADD COLUMN "seller_name" VARCHAR(255),
  ADD COLUMN "seller_tax_id" VARCHAR(100),
  ADD COLUMN "subtotal" VARCHAR(100),
  ADD COLUMN "total_tax" VARCHAR(100),
  ADD COLUMN "total_amount" VARCHAR(100),
  ADD COLUMN "total_amount_in_words" VARCHAR(100),
  ADD COLUMN "remarks" VARCHAR(1000),
  ADD COLUMN "drawer" VARCHAR(100),
  ADD COLUMN "invoice_items" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX "ocr_recognitions_invoice_number_idx" ON "ocr_recognitions"("invoice_number");
CREATE INDEX "ocr_recognitions_user_id_recognition_type_created_at_idx" ON "ocr_recognitions"("user_id", "recognition_type", "created_at");

UPDATE "system_menus"
SET "label" = '电子发票识别', "target_id" = 'invoice', "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'ocr:recognition';

INSERT INTO "system_menus" ("id", "group_id", "group_label", "label", "icon", "target", "target_id", "permission_code", "order", "enabled", "created_at", "updated_at")
VALUES ('ocr:payment', 'tools', '智能工具', '支付截图自动识别', 'ScanLine', 'ocr-recognition', 'payment', 'ocr:view', 64, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET "label" = EXCLUDED."label", "target_id" = EXCLUDED."target_id", "updated_at" = CURRENT_TIMESTAMP;

UPDATE "roles"
SET "name" = 'OCR 识别员',
    "description" = '可使用支付截图和电子发票识别、查看个人记录并导出结果',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'OCR_OPERATOR';
