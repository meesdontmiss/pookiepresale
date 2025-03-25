-- Create a function to execute SQL statements
-- This is needed for the initialization script
CREATE OR REPLACE FUNCTION public.exec_sql(sql_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_query;
END;
$$;

-- Grant usage to service role
GRANT EXECUTE ON FUNCTION public.exec_sql TO service_role; 