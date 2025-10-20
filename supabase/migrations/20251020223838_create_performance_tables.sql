/*
  # Store Performance Dashboard Database Schema

  1. New Tables
    - `uploaded_files`
      - `id` (uuid, primary key)
      - `filename` (text)
      - `uploaded_by` (text) - email of uploader
      - `uploaded_at` (timestamptz)
      - `file_size` (bigint)
      - `processing_status` (text) - pending, processing, completed, failed
      
    - `sales_data`
      - `id` (uuid, primary key)
      - `file_id` (uuid, foreign key to uploaded_files)
      - `name` (text) - sales person name
      - `sales_count` (integer)
      - `calls` (integer)
      - `texts` (integer)
      - `created` (integer) - appointments created
      - `shown` (integer) - appointments shown
      - `period` (text) - e.g., "2025-01" for January 2025
      - `created_at` (timestamptz)
      
    - `bdc_data`
      - `id` (uuid, primary key)
      - `file_id` (uuid, foreign key to uploaded_files)
      - `name` (text) - BDC agent name
      - `shows` (integer)
      - `created` (integer) - appointments created
      - `shown` (integer) - appointments shown
      - `calls` (integer)
      - `period` (text)
      - `created_at` (timestamptz)
      
    - `person_details`
      - `id` (uuid, primary key)
      - `file_id` (uuid, foreign key to uploaded_files)
      - `name` (text)
      - `type` (text) - Sales or BDC
      - `working_days` (integer)
      - `calls_mtd` (integer)
      - `sales_mtd` (integer)
      - `texts_mtd` (integer)
      - `shown_mtd` (integer)
      - `created_mtd` (integer)
      - `leads_in_name_mtd` (integer)
      - `avg_talk` (text)
      - `last_work_day` (date)
      - `last_day_calls` (integer)
      - `last_day_sales` (integer)
      - `last_day_avg_talk` (text)
      - `pr_notes_wins` (text)
      - `pr_notes_opportunities` (text)
      - `period` (text)
      - `created_at` (timestamptz)
      
    - `call_sheets`
      - `id` (uuid, primary key)
      - `file_id` (uuid, foreign key to uploaded_files)
      - `assigned_to` (text) - name of sales person
      - `customer_name` (text)
      - `phone` (text)
      - `email` (text)
      - `sales_person` (text)
      - `bdc_agent` (text)
      - `source` (text)
      - `date_in` (date)
      - `lead_age` (integer)
      - `days_since` (integer)
      - `bucket` (text)
      - `status` (text)
      - `reason` (text)
      - `link` (text)
      - `rep_called_last_work_day` (boolean)
      - `last_work_day` (text)
      - `period` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create uploaded_files table
CREATE TABLE IF NOT EXISTS uploaded_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  uploaded_by text NOT NULL,
  uploaded_at timestamptz DEFAULT now(),
  file_size bigint DEFAULT 0,
  processing_status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view uploaded files"
  ON uploaded_files FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can upload files"
  ON uploaded_files FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create sales_data table
CREATE TABLE IF NOT EXISTS sales_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid REFERENCES uploaded_files(id) ON DELETE CASCADE,
  name text NOT NULL,
  sales_count integer DEFAULT 0,
  calls integer DEFAULT 0,
  texts integer DEFAULT 0,
  created integer DEFAULT 0,
  shown integer DEFAULT 0,
  period text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sales data"
  ON sales_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sales data"
  ON sales_data FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create bdc_data table
CREATE TABLE IF NOT EXISTS bdc_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid REFERENCES uploaded_files(id) ON DELETE CASCADE,
  name text NOT NULL,
  shows integer DEFAULT 0,
  created integer DEFAULT 0,
  shown integer DEFAULT 0,
  calls integer DEFAULT 0,
  period text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bdc_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bdc data"
  ON bdc_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert bdc data"
  ON bdc_data FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create person_details table
CREATE TABLE IF NOT EXISTS person_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid REFERENCES uploaded_files(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  working_days integer DEFAULT 0,
  calls_mtd integer DEFAULT 0,
  sales_mtd integer DEFAULT 0,
  texts_mtd integer DEFAULT 0,
  shown_mtd integer DEFAULT 0,
  created_mtd integer DEFAULT 0,
  leads_in_name_mtd integer DEFAULT 0,
  avg_talk text DEFAULT '0:00',
  last_work_day date,
  last_day_calls integer DEFAULT 0,
  last_day_sales integer DEFAULT 0,
  last_day_avg_talk text DEFAULT '0:00',
  pr_notes_wins text,
  pr_notes_opportunities text,
  period text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE person_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view person details"
  ON person_details FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert person details"
  ON person_details FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create call_sheets table
CREATE TABLE IF NOT EXISTS call_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid REFERENCES uploaded_files(id) ON DELETE CASCADE,
  assigned_to text NOT NULL,
  customer_name text,
  phone text,
  email text,
  sales_person text,
  bdc_agent text,
  source text,
  date_in date,
  lead_age integer,
  days_since integer,
  bucket text,
  status text,
  reason text,
  link text,
  rep_called_last_work_day boolean DEFAULT false,
  last_work_day text,
  period text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE call_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view call sheets"
  ON call_sheets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert call sheets"
  ON call_sheets FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_data_period ON sales_data(period);
CREATE INDEX IF NOT EXISTS idx_sales_data_name ON sales_data(name);
CREATE INDEX IF NOT EXISTS idx_bdc_data_period ON bdc_data(period);
CREATE INDEX IF NOT EXISTS idx_bdc_data_name ON bdc_data(name);
CREATE INDEX IF NOT EXISTS idx_person_details_period ON person_details(period);
CREATE INDEX IF NOT EXISTS idx_person_details_name ON person_details(name);
CREATE INDEX IF NOT EXISTS idx_call_sheets_period ON call_sheets(period);
CREATE INDEX IF NOT EXISTS idx_call_sheets_assigned_to ON call_sheets(assigned_to);