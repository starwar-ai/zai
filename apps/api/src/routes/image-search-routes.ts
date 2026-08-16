import { Router } from "express"
import { deleteImageSearchAsset, deleteImageSearchHistory, getExternalImageSearchAssetFile, getImageSearchAssetFile, getImageSearchAssets, getImageSearchHistory, getImageSearchQueryFile, postExternalImageSearch, postImageSearchAsset, postIndexImageSearchAsset, postIndexPendingImageSearchAssets, postSearchByImage } from "../controllers/image-search-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"
import { requireExternalApiKey } from "../middleware/external-api-key.js"
import { requireSystemPermission } from "../middleware/system-permission.js"

export const imageSearchRoutes = Router()
imageSearchRoutes.post("/external/image-search/search", requireExternalApiKey, asyncHandler(postExternalImageSearch))
imageSearchRoutes.get("/external/image-search/assets/:id/image", requireExternalApiKey, asyncHandler(getExternalImageSearchAssetFile))
imageSearchRoutes.get("/image-search/assets", requireSystemPermission("image-search:view"), asyncHandler(getImageSearchAssets))
imageSearchRoutes.post("/image-search/assets", requireSystemPermission("image-search:manage"), asyncHandler(postImageSearchAsset))
imageSearchRoutes.get("/image-search/assets/:id/image", requireSystemPermission("image-search:view"), asyncHandler(getImageSearchAssetFile))
imageSearchRoutes.delete("/image-search/assets/:id", requireSystemPermission("image-search:manage"), asyncHandler(deleteImageSearchAsset))
imageSearchRoutes.post("/image-search/assets/:id/index", requireSystemPermission("image-search:index"), asyncHandler(postIndexImageSearchAsset))
imageSearchRoutes.post("/image-search/assets/index-pending", requireSystemPermission("image-search:index"), asyncHandler(postIndexPendingImageSearchAssets))
imageSearchRoutes.post("/image-search/search", requireSystemPermission("image-search:search"), asyncHandler(postSearchByImage))
imageSearchRoutes.get("/image-search/history", requireSystemPermission("image-search:view"), asyncHandler(getImageSearchHistory))
imageSearchRoutes.get("/image-search/history/:id/query-image", requireSystemPermission("image-search:view"), asyncHandler(getImageSearchQueryFile))
imageSearchRoutes.delete("/image-search/history/:id", requireSystemPermission("image-search:view"), asyncHandler(deleteImageSearchHistory))
