-- User email (password reset codes are sent to it) + business key (guards the /user endpoints)
-- Run this once in Postgres / Supabase.
--
-- users.email is nullable so existing users keep working, but they cannot reset a password until one is set.
-- business.key_hash is the sha256 hex of the raw business key. Existing deployments set it once by hand:
--   UPDATE public.business SET key_hash = encode(sha256('your-long-random-key'::bytea), 'hex');
-- (a business created through POST /business gets a generated key, returned once in the response)

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON public.users (lower(email));

ALTER TABLE public.business
    ADD COLUMN IF NOT EXISTS key_hash text;
