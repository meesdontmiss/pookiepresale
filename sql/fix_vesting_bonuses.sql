-- Update vesting options to match the frontend bonus percentages
UPDATE public.vesting_options 
SET bonus_percentage = CASE
  WHEN days = 0 THEN 0   -- No lock-up: 0% bonus
  WHEN days = 1 THEN 5   -- 1-day lock-up: 5% bonus
  WHEN days = 3 THEN 15  -- 3-day lock-up: 15% bonus (was 10%)
  WHEN days = 5 THEN 30  -- 5-day lock-up: 30% bonus (was 15%)
  WHEN days = 7 THEN 50  -- 7-day lock-up: 50% bonus (was 25%)
  ELSE bonus_percentage
END,
updated_at = NOW()
WHERE is_active = true;

-- Verify the updated values
SELECT days, bonus_percentage 
FROM public.vesting_options 
ORDER BY days; 