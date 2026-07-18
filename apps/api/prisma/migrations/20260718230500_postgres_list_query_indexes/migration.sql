CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "documents_search_text_trgm_idx"
ON "documents" USING GIN ("search_text" gin_trgm_ops);

CREATE INDEX "documents_master_data_gin_idx"
ON "documents" USING GIN ("master_data" jsonb_path_ops);

CREATE INDEX "documents_detail_tables_gin_idx"
ON "documents" USING GIN ("detail_tables" jsonb_path_ops);
