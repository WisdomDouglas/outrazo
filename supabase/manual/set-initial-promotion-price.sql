-- PROPOSAL (review-only): set the FIRST promotion daily price.
--
-- promotion_pricing starts EMPTY (no seed row by design). No promotion
-- order can be created until a super_admin or finance_admin records the
-- first rate through set_promotion_price(). Run this while signed in as
-- such an admin, AFTER choosing the approved daily price.
--
-- HOW TO USE:
--   1. Replace NULL below with the approved daily price in KOBO
--      (integer, minimum 10000 = NGN 100 for a 1-day promotion).
--      Examples: 200000 = NGN 2,000/day; 500000 = NGN 5,000/day.
--   2. Run statement 1, then statement 2 to verify.
-- As written (NULL), statement 1 FAILS LOUDLY by design so the price can
-- never be set accidentally.

-- Statement 1: record the first daily rate (audited as admin.pricing.set).
SELECT public.set_promotion_price(NULL);

-- Statement 2: verify the current price (latest effective row wins).
SELECT daily_amount_kobo,
       (daily_amount_kobo / 100.0)::numeric(12, 2) AS ngn_per_day,
       currency,
       effective_at,
       created_by,
       created_at
FROM public.promotion_pricing
ORDER BY effective_at DESC
LIMIT 5;
