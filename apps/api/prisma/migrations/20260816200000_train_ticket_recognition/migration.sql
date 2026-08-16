ALTER TABLE "ocr_recognitions"
ADD COLUMN "train_invoice_no" VARCHAR(100),
ADD COLUMN "train_issue_date" VARCHAR(100),
ADD COLUMN "departure_station" VARCHAR(100),
ADD COLUMN "arrival_station" VARCHAR(100),
ADD COLUMN "train_no" VARCHAR(30),
ADD COLUMN "departure_date" VARCHAR(100),
ADD COLUMN "departure_time" VARCHAR(30),
ADD COLUMN "seat_no" VARCHAR(100),
ADD COLUMN "seat_class" VARCHAR(50),
ADD COLUMN "ticket_price" VARCHAR(80),
ADD COLUMN "passenger_id" VARCHAR(50),
ADD COLUMN "passenger_name" VARCHAR(100),
ADD COLUMN "ticket_no" VARCHAR(100),
ADD COLUMN "train_buyer_name" VARCHAR(255),
ADD COLUMN "train_buyer_credit_code" VARCHAR(30);

INSERT INTO "system_menus" ("id", "group_id", "group_label", "label", "icon", "target", "target_id", "permission_code", "order", "enabled", "created_at", "updated_at")
VALUES ('ocr:train-ticket', 'tools', '智能工具', '火车票识别', 'Train', 'ocr-recognition', 'train-ticket', 'ocr:view', 62, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET "label" = EXCLUDED."label", "icon" = EXCLUDED."icon", "target_id" = EXCLUDED."target_id", "order" = EXCLUDED."order", "updated_at" = CURRENT_TIMESTAMP;

UPDATE "roles"
SET "description" = '可使用火车票、导航、支付截图和电子发票识别，查看个人记录并导出结果', "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'OCR_OPERATOR';
