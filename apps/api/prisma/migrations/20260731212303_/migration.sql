-- DropForeignKey
ALTER TABLE "departments" DROP CONSTRAINT "departments_parent_id_fkey";

-- AlterTable
ALTER TABLE "departments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ocr_recognitions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;
