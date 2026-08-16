ALTER TABLE "ocr_recognitions"
ADD COLUMN "route_result_status" VARCHAR(20),
ADD COLUMN "distance_km" DECIMAL(12,2),
ADD COLUMN "toll_yuan" DECIMAL(12,2),
ADD COLUMN "destination" VARCHAR(240),
ADD COLUMN "waypoints" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "confidence" DECIMAL(5,4),
ADD COLUMN "selected_route_evidence" VARCHAR(1000);
