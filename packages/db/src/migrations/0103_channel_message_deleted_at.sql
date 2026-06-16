ALTER TABLE "channel_messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
