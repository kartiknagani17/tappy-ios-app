-- Tappy product database (SQLite, FTS5 trigram search).

-- One normalized row per product, keyed by GTIN-14. Built from source_records by the
-- source-priority merge (see src/lib/merge.ts), or from an approved user contribution.
CREATE TABLE products (
  id                 INTEGER PRIMARY KEY,
  gtin14             TEXT NOT NULL UNIQUE CHECK (length(gtin14) = 14),
  name               TEXT NOT NULL,
  brand              TEXT,
  variant_or_flavor  TEXT,
  size_text          TEXT,
  ingredients_text   TEXT,
  allergens_text     TEXT,
  nutrition_json     TEXT,
  category           TEXT,
  image_url          TEXT,
  source             TEXT NOT NULL CHECK (source IN ('usda', 'off', 'user', 'ocr')),
  source_record_id   TEXT,
  source_updated_at  TEXT,
  verified           INTEGER NOT NULL DEFAULT 0,
  report_count       INTEGER NOT NULL DEFAULT 0,
  needs_review       INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX products_needs_review ON products (needs_review) WHERE needs_review = 1;

-- Raw + normalized record per (source, GTIN), kept so products can be re-merged or
-- re-imported later without re-downloading. raw_json holds the untouched source fields.
CREATE TABLE source_records (
  source             TEXT NOT NULL CHECK (source IN ('usda', 'off')),
  gtin14             TEXT NOT NULL,
  source_record_id   TEXT NOT NULL,
  name               TEXT,
  brand              TEXT,
  variant_or_flavor  TEXT,
  size_text          TEXT,
  ingredients_text   TEXT,
  allergens_text     TEXT,
  nutrition_json     TEXT,
  category           TEXT,
  image_url          TEXT,
  source_updated_at  TEXT,
  raw_json           TEXT NOT NULL,
  imported_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (source, gtin14)
);
CREATE INDEX source_records_gtin ON source_records (gtin14);

-- Fuzzy search over brand + name + variant + size (trigram tokenizer = substring/typo tolerant).
CREATE VIRTUAL TABLE product_search USING fts5(
  brand, name, variant, size,
  content = 'products', content_rowid = 'id', tokenize = 'trigram'
);
CREATE TRIGGER products_ai AFTER INSERT ON products BEGIN
  INSERT INTO product_search (rowid, brand, name, variant, size)
  VALUES (new.id, coalesce(new.brand, ''), new.name, coalesce(new.variant_or_flavor, ''), coalesce(new.size_text, ''));
END;
CREATE TRIGGER products_ad AFTER DELETE ON products BEGIN
  INSERT INTO product_search (product_search, rowid, brand, name, variant, size)
  VALUES ('delete', old.id, coalesce(old.brand, ''), old.name, coalesce(old.variant_or_flavor, ''), coalesce(old.size_text, ''));
END;
CREATE TRIGGER products_au AFTER UPDATE OF brand, name, variant_or_flavor, size_text ON products BEGIN
  INSERT INTO product_search (product_search, rowid, brand, name, variant, size)
  VALUES ('delete', old.id, coalesce(old.brand, ''), old.name, coalesce(old.variant_or_flavor, ''), coalesce(old.size_text, ''));
  INSERT INTO product_search (rowid, brand, name, variant, size)
  VALUES (new.id, coalesce(new.brand, ''), new.name, coalesce(new.variant_or_flavor, ''), coalesce(new.size_text, ''));
END;

-- Barcode lookups. found = 0 rows are negative results with a short TTL.
CREATE TABLE scan_cache (
  gtin14       TEXT PRIMARY KEY,
  found        INTEGER NOT NULL,
  result_json  TEXT NOT NULL,
  expires_at   INTEGER NOT NULL,   -- unix seconds
  created_at   INTEGER NOT NULL
);

-- Vision results keyed by a 64-bit perceptual hash (dHash) of the resized image.
-- band0..band3 are the hash split into four 16-bit bands: any two hashes within
-- Hamming distance 3 share at least one band exactly, so near-duplicate lookup is indexed.
CREATE TABLE vision_cache (
  id                 INTEGER PRIMARY KEY,
  kind               TEXT NOT NULL CHECK (kind IN ('front', 'label')),
  phash              TEXT NOT NULL,
  band0              TEXT NOT NULL,
  band1              TEXT NOT NULL,
  band2              TEXT NOT NULL,
  band3              TEXT NOT NULL,
  model              TEXT NOT NULL,
  parsed_json        TEXT NOT NULL,
  chosen_product_id  INTEGER REFERENCES products (id) ON DELETE SET NULL,
  hit_count          INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL
);
CREATE INDEX vision_cache_b0 ON vision_cache (kind, band0);
CREATE INDEX vision_cache_b1 ON vision_cache (kind, band1);
CREATE INDEX vision_cache_b2 ON vision_cache (kind, band2);
CREATE INDEX vision_cache_b3 ON vision_cache (kind, band3);

-- User-submitted ingredient-panel results awaiting review.
CREATE TABLE contributions (
  id                INTEGER PRIMARY KEY,
  gtin14            TEXT,
  front_photo_hash  TEXT,
  user_id           TEXT NOT NULL,
  ingredients_text  TEXT NOT NULL,
  allergens_text    TEXT,
  may_contain_text  TEXT,
  nutrition_json    TEXT,
  raw_json          TEXT NOT NULL,
  model             TEXT,
  confidence        REAL,
  image_path        TEXT,             -- only set when the user opted in to contribute the photo
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (gtin14 IS NOT NULL OR front_photo_hash IS NOT NULL)
);
CREATE INDEX contributions_gtin ON contributions (gtin14, user_id);
CREATE INDEX contributions_front ON contributions (front_photo_hash, user_id);
CREATE INDEX contributions_status ON contributions (status);

CREATE TABLE product_reports (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Spend tracking: one row per vision model call.
CREATE TABLE vision_calls (
  id             INTEGER PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  user_id        TEXT,
  task           TEXT NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  attempt        INTEGER NOT NULL,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  latency_ms     INTEGER NOT NULL,
  est_cost_usd   REAL,
  ok             INTEGER NOT NULL,
  error          TEXT
);

-- Per-user daily counters for the free scan limit.
CREATE TABLE usage_daily (
  user_id      TEXT NOT NULL,
  day          TEXT NOT NULL,          -- YYYY-MM-DD (UTC)
  scans        INTEGER NOT NULL DEFAULT 0,
  photo_scans  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Import bookkeeping (progress + reruns).
CREATE TABLE import_runs (
  id          INTEGER PRIMARY KEY,
  source      TEXT NOT NULL,
  file        TEXT,
  started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT,
  rows_read   INTEGER NOT NULL DEFAULT 0,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  rows_skipped  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'running'
);

-- USDA staging tables (filled while streaming food.csv / food_nutrient.csv, then joined to branded_food.csv).
CREATE TABLE usda_food_stage (
  fdc_id            INTEGER PRIMARY KEY,
  description       TEXT,
  publication_date  TEXT
);
CREATE TABLE usda_nutrient_stage (
  fdc_id  INTEGER NOT NULL,
  key     TEXT NOT NULL,
  amount  REAL NOT NULL,
  PRIMARY KEY (fdc_id, key)
) WITHOUT ROWID;
