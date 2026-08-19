ALTER TABLE "ocr_recognitions"
  ADD COLUMN "invoice_category" VARCHAR(20),
  ADD COLUMN "vehicle_plate" VARCHAR(50),
  ADD COLUMN "vehicle_type" VARCHAR(50),
  ADD COLUMN "toll_amount" VARCHAR(100),
  ADD COLUMN "toll_date" VARCHAR(100);

ALTER TABLE "ocr_recognitions"
  ADD CONSTRAINT "ocr_recognitions_invoice_category_check"
  CHECK ("invoice_category" IS NULL OR "invoice_category" IN ('STANDARD', 'TOLL'));
