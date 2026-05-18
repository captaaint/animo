-- Billable + hourly rate + currency support.
-- projects gain an hourly_rate (default 0 = no rate) and a currency (default EUR).
-- time_entries gain a billable flag (default 0 = not billable).
ALTER TABLE projects ADD COLUMN hourly_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE time_entries ADD COLUMN billable INTEGER NOT NULL DEFAULT 0;
