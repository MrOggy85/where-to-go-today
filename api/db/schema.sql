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
  -- "want to go" is derived: active and never visited. It is not a stored status.
  status      TEXT NOT NULL DEFAULT 'active',   -- active | archived
  environment TEXT NOT NULL,                    -- indoor | outdoor | mixed

  address          TEXT,
  latitude         REAL,
  longitude        REAL,
  google_maps_url  TEXT,
  website_url      TEXT,

  drive_minutes          INTEGER,
  train_minutes          INTEGER,
  typical_duration_hours REAL,                  -- whole hours usually, halves allowed
  cost_level             TEXT,                  -- free | low | medium | high

  good_for_rain         INTEGER,                -- 0/1/null, null means unknown
  good_for_hot_weather  INTEGER,
  good_for_cold_weather INTEGER,
  good_for_wind         INTEGER,
  shaded                INTEGER,

  parking        TEXT,                          -- yes | no | unknown
  food_available TEXT,
  toilets        TEXT,

  priority INTEGER NOT NULL DEFAULT 1,

  notes TEXT,

  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  created_by_profile_id  TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS places_household_status ON places(household_id, status);
CREATE INDEX IF NOT EXISTS places_drive_minutes ON places(drive_minutes);
CREATE INDEX IF NOT EXISTS places_train_minutes ON places(train_minutes);

-- Categories are household-owned records, not free text on the place, so they can be
-- renamed in one place and offered as a closed list when editing.
CREATE TABLE IF NOT EXISTS categories (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- NOCASE so "Park" cannot be added alongside "park".
CREATE UNIQUE INDEX IF NOT EXISTS categories_household_name
  ON categories(household_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS place_categories (
  place_id    TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (place_id, category_id)
);

CREATE INDEX IF NOT EXISTS place_categories_category ON place_categories(category_id);

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

-- Compressed memory copies. The bytes live on disk under the data directory; only metadata
-- is stored here. place_id is required but visit_id is not: a photo of a place does not
-- have to belong to an outing, and deleting a visit keeps its photos on the place.
CREATE TABLE IF NOT EXISTS photos (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  place_id     TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  visit_id     TEXT REFERENCES visits(id) ON DELETE SET NULL,

  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,

  captured_at TEXT,
  uploaded_at TEXT NOT NULL,
  uploaded_by_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS photos_visit ON photos(visit_id);
CREATE INDEX IF NOT EXISTS photos_place_uploaded ON photos(place_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS photos_household_uploaded ON photos(household_id, uploaded_at DESC);
