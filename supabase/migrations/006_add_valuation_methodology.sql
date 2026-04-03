-- Add methodology and source tracking columns to valuations table
ALTER TABLE valuations ADD COLUMN IF NOT EXISTS methodology text;
ALTER TABLE valuations ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
