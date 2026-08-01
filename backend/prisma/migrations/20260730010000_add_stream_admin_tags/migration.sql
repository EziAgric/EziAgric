-- Free-form operator labels so the admin stream list (GET /api/admin/streams)
-- can filter by admin tag in addition to lifecycle status and vesting state.
ALTER TABLE "Stream" ADD COLUMN "adminTags" TEXT[] NOT NULL DEFAULT '{}';
