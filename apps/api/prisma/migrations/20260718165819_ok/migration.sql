-- AlterTable
ALTER TABLE "activity_records" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "data_permission_policies" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "documents" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "roles" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_notifications" ALTER COLUMN "id" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "declaration_name_mappings_normalized_name_normalized_name_eng_k" RENAME TO "declaration_name_mappings_normalized_name_normalized_name_e_key";

-- RenameIndex
ALTER INDEX "declaration_name_source_items_normalized_name_normalized_name_e" RENAME TO "declaration_name_source_items_normalized_name_normalized_na_idx";
