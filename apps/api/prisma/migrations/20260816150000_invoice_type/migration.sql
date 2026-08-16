ALTER TABLE "ocr_recognitions"
  ADD COLUMN "invoice_type" VARCHAR(20);

ALTER TABLE "ocr_recognitions"
  ADD CONSTRAINT "ocr_recognitions_invoice_type_check"
  CHECK ("invoice_type" IS NULL OR "invoice_type" IN ('VAT_NORMAL', 'VAT_SPECIAL'));
