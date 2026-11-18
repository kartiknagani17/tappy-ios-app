-- Barcodes people scanned that we had no product for, so we know which items to add. Only the
-- barcode and counts are kept: no device id, so nothing here is personal data.
CREATE TABLE missed_scans (
  gtin14     TEXT PRIMARY KEY,
  scans      INTEGER NOT NULL DEFAULT 1,
  first_at   INTEGER NOT NULL,
  last_at    INTEGER NOT NULL
);
CREATE INDEX missed_scans_scans ON missed_scans (scans DESC);
CREATE INDEX missed_scans_last ON missed_scans (last_at);
