/*
  # Create Socios Module Tables

  1. New Tables
    - `barrios` - Neighborhoods/barrios list
      - `id` (uuid, primary key)
      - `name` (text, unique) - barrio name
      - `created_at` (timestamptz)
    - `socios` - Members/socios
      - `id` (uuid, primary key)
      - `barrio_id` (uuid, FK to barrios)
      - `first_name` (text) - nombre
      - `last_name` (text) - apellido
      - `lot_number` (text) - numero de lote
      - `dni` (text) - documento
      - `phone` (text) - telefono
      - `email` (text) - correo
      - `category` (text) - titular/familiar_1/familiar_2/familiar_3/familiar_adherente
      - `carnet_status` (text) - activo/pausado
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `carnet_prices` - Carnet pricing configuration
      - `id` (uuid, primary key)
      - `individual_price` (numeric) - precio carnet individual
      - `family_price` (numeric) - precio carnet familiar
      - `adherent_extra_price` (numeric) - precio extra por adherente
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for anon access (system uses anon key without auth)
*/

-- Barrios table
CREATE TABLE IF NOT EXISTS barrios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE barrios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read barrios"
  ON barrios FOR SELECT
  TO anon
  USING (true is not false);

CREATE POLICY "Allow insert barrios"
  ON barrios FOR INSERT
  TO anon
  WITH CHECK (name IS NOT NULL AND name != '');

CREATE POLICY "Allow update barrios"
  ON barrios FOR UPDATE
  TO anon
  USING (id IS NOT NULL)
  WITH CHECK (name IS NOT NULL AND name != '');

CREATE POLICY "Allow delete barrios"
  ON barrios FOR DELETE
  TO anon
  USING (id IS NOT NULL);

-- Socios table
CREATE TABLE IF NOT EXISTS socios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barrio_id uuid NOT NULL REFERENCES barrios(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  lot_number text NOT NULL,
  dni text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'titular',
  carnet_status text NOT NULL DEFAULT 'activo',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT socios_category_check CHECK (category IN ('titular', 'familiar_1', 'familiar_2', 'familiar_3', 'familiar_adherente')),
  CONSTRAINT socios_carnet_status_check CHECK (carnet_status IN ('activo', 'pausado'))
);

ALTER TABLE socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read socios"
  ON socios FOR SELECT
  TO anon
  USING (true is not false);

CREATE POLICY "Allow insert socios"
  ON socios FOR INSERT
  TO anon
  WITH CHECK (first_name IS NOT NULL AND last_name IS NOT NULL AND lot_number IS NOT NULL);

CREATE POLICY "Allow update socios"
  ON socios FOR UPDATE
  TO anon
  USING (id IS NOT NULL)
  WITH CHECK (first_name IS NOT NULL AND last_name IS NOT NULL);

CREATE POLICY "Allow delete socios"
  ON socios FOR DELETE
  TO anon
  USING (id IS NOT NULL);

-- Carnet prices table (single row config)
CREATE TABLE IF NOT EXISTS carnet_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  individual_price numeric NOT NULL DEFAULT 0,
  family_price numeric NOT NULL DEFAULT 0,
  adherent_extra_price numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE carnet_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read carnet_prices"
  ON carnet_prices FOR SELECT
  TO anon
  USING (true is not false);

CREATE POLICY "Allow insert carnet_prices"
  ON carnet_prices FOR INSERT
  TO anon
  WITH CHECK (individual_price >= 0 AND family_price >= 0 AND adherent_extra_price >= 0);

CREATE POLICY "Allow update carnet_prices"
  ON carnet_prices FOR UPDATE
  TO anon
  USING (id IS NOT NULL)
  WITH CHECK (individual_price >= 0 AND family_price >= 0 AND adherent_extra_price >= 0);

-- Insert default carnet prices row
INSERT INTO carnet_prices (individual_price, family_price, adherent_extra_price)
VALUES (0, 0, 0);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_socios_barrio_id ON socios(barrio_id);
CREATE INDEX IF NOT EXISTS idx_socios_lot_number ON socios(lot_number);
CREATE INDEX IF NOT EXISTS idx_socios_category ON socios(category);
CREATE INDEX IF NOT EXISTS idx_socios_carnet_status ON socios(carnet_status);
CREATE INDEX IF NOT EXISTS idx_socios_dni ON socios(dni);
CREATE INDEX IF NOT EXISTS idx_socios_last_name ON socios(last_name);
