-- Single-household family outing planner. One SQLite file, no ORM.
-- Every family-owned row carries household_id so a later second household stays possible.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS profiles_household ON profiles(household_id);

-- profile_id is null between password login and profile selection.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id   TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS places (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',   -- want_to_go | active | archived
  environment TEXT NOT NULL,                    -- indoor | outdoor | mixed

  address          TEXT,
  latitude         REAL,
  longitude        REAL,
  google_maps_url  TEXT,
  website_url      TEXT,

  drive_minutes            INTEGER,
  train_minutes            INTEGER,
  typical_duration_minutes INTEGER,
  cost_level               TEXT,                -- free | low | medium | high

  good_for_rain         INTEGER,                -- 0/1/null, null means unknown
  good_for_hot_weather  INTEGER,
  good_for_cold_weather INTEGER,
  good_for_wind         INTEGER,
  shaded                INTEGER,

  parking           TEXT,                       -- yes | no | unknown
  stroller_friendly TEXT,
  food_available    TEXT,
  toilets           TEXT,

  priority                INTEGER NOT NULL DEFAULT 1,
  preferred_cooldown_days INTEGER,

  notes TEXT,

  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  created_by_profile_id  TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS places_household_status ON places(household_id, status);
CREATE INDEX IF NOT EXISTS places_drive_minutes ON places(drive_minutes);
CREATE INDEX IF NOT EXISTS places_train_minutes ON places(train_minutes);

CREATE TABLE IF NOT EXISTS place_categories (
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  PRIMARY KEY (place_id, category)
);

CREATE INDEX IF NOT EXISTS place_categories_category ON place_categories(category);

-- Append-only outing log. lastVisitedAt is derived with MAX(visited_at), never stored.
CREATE TABLE IF NOT EXISTS visits (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  place_id     TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,

  visited_at TEXT NOT NULL,
  note       TEXT,
  rating     INTEGER,

  created_at            TEXT NOT NULL,
  created_by_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS visits_place_visited ON visits(place_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS visits_household_visited ON visits(household_id, visited_at DESC);
