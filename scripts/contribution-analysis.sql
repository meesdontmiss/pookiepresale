-- SQL Script for analyzing Pookie presale contributions
-- Run this directly in the Supabase SQL editor or through psql

-- Create a temporary table for the report
DROP TABLE IF EXISTS temp_contribution_report;
CREATE TEMP TABLE temp_contribution_report AS (
  -- Overall summary
  WITH summary AS (
    SELECT
      SUM(amount) AS total_raised,
      COUNT(DISTINCT wallet_address) AS unique_contributors,
      SUM(amount) / COUNT(DISTINCT wallet_address) AS avg_contribution,
      COUNT(*) AS total_contributions
    FROM public.contributions
    WHERE is_verified = true
  ),
  
  -- Tier breakdown
  tier_summary AS (
    SELECT
      COALESCE(tier, 'unknown') AS tier,
      SUM(amount) AS amount,
      COUNT(DISTINCT wallet_address) AS contributors,
      COUNT(*) AS contributions
    FROM public.contributions
    WHERE is_verified = true
    GROUP BY COALESCE(tier, 'unknown')
  ),
  
  -- Wallet summary
  wallet_summary AS (
    SELECT
      wallet_address,
      SUM(amount) AS total_amount,
      COUNT(*) AS contribution_count
    FROM public.contributions
    WHERE is_verified = true
    GROUP BY wallet_address
    ORDER BY SUM(amount) DESC
    LIMIT 20
  )
  
  SELECT
    'summary' AS report_type,
    NULL AS tier,
    NULL AS wallet_address,
    s.total_raised,
    s.unique_contributors,
    s.avg_contribution,
    s.total_contributions,
    NULL AS contributors,
    NULL AS contribution_count
  FROM summary s
  
  UNION ALL
  
  SELECT
    'tier' AS report_type,
    ts.tier,
    NULL AS wallet_address,
    ts.amount AS total_raised,
    NULL AS unique_contributors,
    NULL AS avg_contribution,
    ts.contributions AS total_contributions,
    ts.contributors,
    NULL AS contribution_count
  FROM tier_summary ts
  
  UNION ALL
  
  SELECT
    'wallet' AS report_type,
    NULL AS tier,
    ws.wallet_address,
    ws.total_amount AS total_raised,
    NULL AS unique_contributors,
    NULL AS avg_contribution,
    NULL AS total_contributions,
    NULL AS contributors,
    ws.contribution_count
  FROM wallet_summary ws
);

-- Output summary
SELECT * FROM (
  SELECT 
    total_raised,
    unique_contributors,
    avg_contribution,
    total_contributions
  FROM temp_contribution_report 
  WHERE report_type = 'summary'
) t;

-- Output tier breakdown
SELECT * FROM (
  SELECT 
    CASE 
      WHEN tier = 'core' THEN 'Private Sale (Core)'
      WHEN tier = 'public' THEN 'Public Sale'
      ELSE tier
    END AS tier_name,
    tier,
    amount,
    contributors,
    contributions,
    ROUND((amount / (SELECT total_raised FROM temp_contribution_report WHERE report_type = 'summary' LIMIT 1)) * 100, 2) AS percentage
  FROM temp_contribution_report 
  WHERE report_type = 'tier'
  ORDER BY amount DESC
) t;

-- Output top contributors
SELECT * FROM (
  SELECT 
    wallet_address,
    total_raised,
    contribution_count
  FROM temp_contribution_report 
  WHERE report_type = 'wallet'
  ORDER BY total_raised DESC
  LIMIT 10
) t;

-- Create a version of the report that can be exported as CSV
SELECT
  CASE
    WHEN report_type = 'summary' THEN 'Overall Summary'
    WHEN report_type = 'tier' THEN 'Tier: ' || CASE WHEN tier = 'core' THEN 'Private Sale (Core)' WHEN tier = 'public' THEN 'Public Sale' ELSE tier END
    WHEN report_type = 'wallet' THEN 'Wallet: ' || wallet_address
  END AS category,
  ROUND(total_raised::numeric, 4) AS amount,
  unique_contributors,
  ROUND(avg_contribution::numeric, 4) AS avg_amount,
  total_contributions,
  contributors,
  contribution_count,
  CASE
    WHEN report_type = 'tier' THEN 
      ROUND((total_raised / (SELECT total_raised FROM temp_contribution_report WHERE report_type = 'summary' LIMIT 1)) * 100, 2)
    ELSE NULL
  END AS percentage
FROM temp_contribution_report
ORDER BY 
  CASE report_type
    WHEN 'summary' THEN 1
    WHEN 'tier' THEN 2
    WHEN 'wallet' THEN 3
    ELSE 4
  END,
  total_raised DESC NULLS LAST;

-- Cleanup
DROP TABLE IF EXISTS temp_contribution_report; 