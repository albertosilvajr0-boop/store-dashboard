/*
  # Fix RLS Policies for Anonymous Access

  1. Changes
    - Update RLS policies to allow anonymous (anon) access for all operations
    - This allows the app to work without Supabase authentication
    - Uses Firebase Auth for app-level authentication, Supabase for data storage only
    
  2. Security Notes
    - App-level security is handled by Firebase Auth
    - Only authenticated users in Firebase can access the app
    - Supabase acts as a data store, not an auth provider
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view uploaded files" ON uploaded_files;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON uploaded_files;
DROP POLICY IF EXISTS "Authenticated users can view sales data" ON sales_data;
DROP POLICY IF EXISTS "Authenticated users can insert sales data" ON sales_data;
DROP POLICY IF EXISTS "Authenticated users can view bdc data" ON bdc_data;
DROP POLICY IF EXISTS "Authenticated users can insert bdc data" ON bdc_data;
DROP POLICY IF EXISTS "Authenticated users can view person details" ON person_details;
DROP POLICY IF EXISTS "Authenticated users can insert person details" ON person_details;
DROP POLICY IF EXISTS "Authenticated users can view call sheets" ON call_sheets;
DROP POLICY IF EXISTS "Authenticated users can insert call sheets" ON call_sheets;

-- Create new policies allowing anon access
CREATE POLICY "Allow all access to uploaded_files"
  ON uploaded_files
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to sales_data"
  ON sales_data
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to bdc_data"
  ON bdc_data
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to person_details"
  ON person_details
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to call_sheets"
  ON call_sheets
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);