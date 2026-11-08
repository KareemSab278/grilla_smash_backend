-- Meal upgrades are configured separately from offers and modifiers.
CREATE TABLE IF NOT EXISTS public.meal_upgrades (
    id text PRIMARY KEY,
    name text NOT NULL,
    price integer NOT NULL CHECK (price >= 0),
    active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meal_upgrade_mains (
    meal_upgrade_id text NOT NULL REFERENCES public.meal_upgrades(id) ON DELETE CASCADE,
    product_id text NOT NULL REFERENCES public.products(id),
    PRIMARY KEY (meal_upgrade_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.meal_upgrade_groups (
    id text PRIMARY KEY,
    meal_upgrade_id text NOT NULL REFERENCES public.meal_upgrades(id) ON DELETE CASCADE,
    name text NOT NULL,
    min_selections integer NOT NULL DEFAULT 1 CHECK (min_selections >= 0),
    max_selections integer NOT NULL DEFAULT 1 CHECK (max_selections >= 1 AND max_selections >= min_selections),
    sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.meal_upgrade_choices (
    id text PRIMARY KEY,
    group_id text NOT NULL REFERENCES public.meal_upgrade_groups(id) ON DELETE CASCADE,
    product_id text NOT NULL REFERENCES public.products(id),
    surcharge integer NOT NULL DEFAULT 0 CHECK (surcharge >= 0),
    active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    UNIQUE (group_id, product_id)
);

CREATE INDEX IF NOT EXISTS meal_upgrade_mains_product_idx ON public.meal_upgrade_mains (product_id);
CREATE INDEX IF NOT EXISTS meal_upgrade_groups_upgrade_idx ON public.meal_upgrade_groups (meal_upgrade_id);

-- A snapshot is independent of the menu rows, which may be edited or deleted later.
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS meal_upgrade jsonb
    CHECK (meal_upgrade IS NULL OR jsonb_typeof(meal_upgrade) = 'object');
