CREATE TABLE "departments" (
  "id" VARCHAR(64) NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "parent_id" VARCHAR(64),
  "order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");
CREATE INDEX "departments_parent_id_order_idx" ON "departments"("parent_id", "order");
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "departments" ("id", "code", "name", "order")
VALUES ('demo-department', 'DEMO', '演示部门', 10)
ON CONFLICT ("id") DO NOTHING;
