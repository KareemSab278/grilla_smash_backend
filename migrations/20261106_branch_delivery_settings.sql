-- Branch delivery and pickup availability settings
ALTER TABLE public.branches
    ADD COLUMN IF NOT EXISTS delivery_disabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pickup_disabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS delivery_range_km integer NOT NULL DEFAULT 5;
