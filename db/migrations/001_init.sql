CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS institution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('HOSPITAL', 'BLOOD_BANK')),
  city TEXT NOT NULL,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS donor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone_encrypted BYTEA,
  blood_group TEXT NOT NULL CHECK (blood_group IN ('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+')),
  date_of_birth DATE NOT NULL,
  last_donation_date DATE,
  organ_pledge BOOLEAN NOT NULL DEFAULT false,
  city TEXT,
  lat NUMERIC,
  lng NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('DONOR', 'HOSPITAL_STAFF', 'BLOODBANK_STAFF', 'ADMIN')),
  institution_id UUID REFERENCES institution(id) ON DELETE SET NULL,
  donor_id UUID REFERENCES donor(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_unit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institution(id) ON DELETE CASCADE,
  blood_group TEXT NOT NULL CHECK (blood_group IN ('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+')),
  component TEXT NOT NULL CHECK (component IN ('WHOLE_BLOOD', 'PRBC', 'PLATELETS', 'PLASMA')),
  collected_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ALLOCATED', 'EXPIRED')),
  expiry_flag TEXT NOT NULL DEFAULT 'OK' CHECK (expiry_flag IN ('OK', 'NEAR_EXPIRY', 'EXPIRED')),
  donor_id UUID REFERENCES donor(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_lookup
  ON inventory_unit (blood_group, component, status);

CREATE TABLE IF NOT EXISTS request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES institution(id) ON DELETE CASCADE,
  blood_group TEXT NOT NULL CHECK (blood_group IN ('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+')),
  component TEXT NOT NULL CHECK (component IN ('WHOLE_BLOOD', 'PRBC', 'PLATELETS', 'PLASMA')),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  urgency TEXT NOT NULL CHECK (urgency IN ('ROUTINE', 'URGENT', 'EMERGENCY')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'MATCHED', 'ESCALATED', 'CANCELLED')),
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_request_queue
  ON request (status, urgency, created_at);

CREATE TABLE IF NOT EXISTS match (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES request(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL UNIQUE REFERENCES inventory_unit(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institution(id) ON DELETE CASCADE,
  distance_km NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
  role TEXT,
  institution_id UUID REFERENCES institution(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP', 'SMS')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
