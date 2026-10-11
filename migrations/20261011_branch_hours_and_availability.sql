-- Branch opening hours + branch-specific product availability
-- Run this once in Postgres / Supabase. It preserves the existing branches table and backfills defaults
-- for existing rows.

ALTER TABLE public.branches
    ADD COLUMN IF NOT EXISTS opening_hours jsonb NOT NULL DEFAULT '{"monday":{"open":"09:00","close":"17:00","is_closed":false},"tuesday":{"open":"09:00","close":"17:00","is_closed":false},"wednesday":{"open":"09:00","close":"17:00","is_closed":false},"thursday":{"open":"09:00","close":"17:00","is_closed":false},"friday":{"open":"09:00","close":"17:00","is_closed":false},"saturday":{"open":"09:00","close":"17:00","is_closed":false},"sunday":{"open":"09:00","close":"17:00","is_closed":false}}'::jsonb,
    ADD COLUMN IF NOT EXISTS unavailable_products text[] NOT NULL DEFAULT '{}'::text[];
