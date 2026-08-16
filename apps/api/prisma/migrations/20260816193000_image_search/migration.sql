CREATE TABLE "image_search_assets" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(50) NOT NULL,
    "image_data" BYTEA NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "description" VARCHAR(1000),
    "embedding" JSONB,
    "embedding_model" VARCHAR(100),
    "indexed_at" TIMESTAMPTZ(3),
    "created_by_id" VARCHAR(64) NOT NULL,
    "department_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "image_search_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "image_search_history" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "query_original_filename" VARCHAR(255) NOT NULL,
    "query_mime_type" VARCHAR(50) NOT NULL,
    "query_image_data" BYTEA NOT NULL,
    "top_k" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "image_search_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "image_search_assets_indexed_at_created_at_idx" ON "image_search_assets"("indexed_at", "created_at");
CREATE INDEX "image_search_assets_created_by_id_created_at_idx" ON "image_search_assets"("created_by_id", "created_at");
CREATE INDEX "image_search_history_user_id_created_at_idx" ON "image_search_history"("user_id", "created_at");
