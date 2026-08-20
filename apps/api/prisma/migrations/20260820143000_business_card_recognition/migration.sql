ALTER TABLE "ocr_recognitions"
  ADD COLUMN "company_name" VARCHAR(255),
  ADD COLUMN "contact_name" VARCHAR(255),
  ADD COLUMN "job_title" VARCHAR(255),
  ADD COLUMN "phone" VARCHAR(255),
  ADD COLUMN "email" VARCHAR(320),
  ADD COLUMN "address" VARCHAR(4000),
  ADD COLUMN "website" VARCHAR(512);

INSERT INTO "system_menus" ("id", "group_id", "group_label", "label", "icon", "target", "target_id", "permission_code", "order", "enabled", "created_at", "updated_at")
VALUES ('ocr:business-card', 'tools', '智能工具', '供应商名片识别', 'ContactRound', 'ocr-recognition', 'business-card', 'ocr:view', 59, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "label" = EXCLUDED."label",
  "icon" = EXCLUDED."icon",
  "target" = EXCLUDED."target",
  "target_id" = EXCLUDED."target_id",
  "permission_code" = EXCLUDED."permission_code",
  "order" = EXCLUDED."order",
  "enabled" = EXCLUDED."enabled",
  "updated_at" = CURRENT_TIMESTAMP;

UPDATE "roles"
SET "description" = '可使用供应商名片、火车票、导航、支付截图和电子发票识别，查看个人记录并导出结果',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'OCR_OPERATOR';
