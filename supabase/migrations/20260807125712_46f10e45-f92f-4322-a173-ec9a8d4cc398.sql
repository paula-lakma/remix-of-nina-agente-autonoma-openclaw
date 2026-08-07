ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS coupon_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS coupon_discount_percent integer;