-- Anvi Mitra ERP: school transport foundation.
-- One school app supports drivers, office staff and parents through the same backend.

CREATE TABLE IF NOT EXISTS driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(30),
  license_no VARCHAR(80),
  license_expiry DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  registration_no VARCHAR(40) NOT NULL,
  vehicle_type VARCHAR(60) NOT NULL DEFAULT 'school_bus',
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  driver_id UUID REFERENCES driver_profiles(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, registration_no)
);

CREATE TABLE IF NOT EXISTS transport_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL,
  vehicle_id UUID REFERENCES transport_vehicles(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS transport_route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL CHECK (stop_order > 0),
  stop_name VARCHAR(200) NOT NULL,
  pickup_time TIME,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  UNIQUE (route_id, stop_order)
);

CREATE TABLE IF NOT EXISTS transport_student_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES transport_route_stops(id) ON DELETE SET NULL,
  pickup_required BOOLEAN NOT NULL DEFAULT true,
  drop_required BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, route_id)
);

CREATE TABLE IF NOT EXISTS transport_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES driver_profiles(id) ON DELETE SET NULL,
  trip_date DATE NOT NULL DEFAULT CURRENT_DATE,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('pickup','drop')),
  status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','started','completed','cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (route_id, trip_date, direction)
);

CREATE TABLE IF NOT EXISTS transport_trip_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES transport_trips(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  stop_id UUID REFERENCES transport_route_stops(id) ON DELETE SET NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('boarded','dropped','absent','skipped')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

CREATE INDEX IF NOT EXISTS transport_vehicle_school_idx ON transport_vehicles(school_id, status);
CREATE INDEX IF NOT EXISTS transport_route_school_idx ON transport_routes(school_id, status);
CREATE INDEX IF NOT EXISTS transport_assignment_student_idx ON transport_student_assignments(school_id, student_id, status);
CREATE INDEX IF NOT EXISTS transport_trip_driver_idx ON transport_trips(school_id, driver_id, trip_date DESC);
CREATE INDEX IF NOT EXISTS transport_event_trip_idx ON transport_trip_events(trip_id, event_at);
