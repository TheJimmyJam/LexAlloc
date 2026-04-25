ALTER TABLE la_profiles ADD COLUMN IF NOT EXISTS notifications_muted boolean NOT NULL DEFAULT false;
