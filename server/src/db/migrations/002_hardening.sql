-- Security hardening (see server security review).

-- Who produced each vision result, and an exact content hash of the uploaded image.
-- Ingredient-panel (label) results are only reused for the same user and the exact same image:
-- near-duplicate perceptual hashes of text panels collide across different products, and a
-- shared label cache let one user plant a doctored ingredient list for everyone else.
ALTER TABLE vision_cache ADD COLUMN user_id TEXT;
ALTER TABLE vision_cache ADD COLUMN content_sha256 TEXT;
CREATE INDEX vision_cache_label_owner ON vision_cache (user_id, content_sha256) WHERE kind = 'label';
DELETE FROM vision_cache WHERE kind = 'label';

-- Products offered to a user for a front photo. A confirmation must pick one of these.
CREATE TABLE vision_offers (
  vision_cache_id  INTEGER NOT NULL REFERENCES vision_cache (id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  product_ids      TEXT NOT NULL,      -- JSON array of product ids
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (vision_cache_id, user_id)
) WITHOUT ROWID;

-- One confirmation per user per front photo. vision_cache.chosen_product_id (shared with every
-- user) is only set once enough distinct users on distinct networks agree.
CREATE TABLE vision_confirmations (
  vision_cache_id  INTEGER NOT NULL REFERENCES vision_cache (id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  ip_key           TEXT NOT NULL,
  product_id       INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (vision_cache_id, user_id)
) WITHOUT ROWID;
CREATE INDEX vision_confirmations_product ON vision_confirmations (vision_cache_id, product_id);

-- Earlier shared choices came from single, unauthenticated confirmations: don't trust them.
UPDATE vision_cache SET chosen_product_id = NULL;

-- One report per user per product.
DELETE FROM product_reports WHERE id NOT IN (SELECT min(id) FROM product_reports GROUP BY product_id, user_id);
CREATE UNIQUE INDEX product_reports_once ON product_reports (product_id, user_id);
UPDATE products SET report_count = (SELECT count(*) FROM product_reports r WHERE r.product_id = products.id)
  WHERE report_count > 0;

-- Daily vision spend ceiling sums today's rows.
CREATE INDEX vision_calls_created ON vision_calls (created_at);
