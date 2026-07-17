-- Migration: Add store location fields to merchants
-- Columns: address, lat, lng

ALTER TABLE merchants
ADD COLUMN address TEXT,
ADD COLUMN lat REAL,
ADD COLUMN lng REAL;
