-- Backfill poolAuth from User.luxorSubaccountName
-- This migration copies each user's luxorSubaccountName to all their miners' poolAuth field
-- 
-- Safety checks:
-- 1. Only updates miners where poolAuth is NULL (idempotent - safe to re-run)
-- 2. Only reads from users where luxorSubaccountName is NOT NULL
-- 3. Matches miners to users via userId foreign key (maintains data integrity)
-- 4. Does NOT delete or modify User.luxorSubaccountName (keeps backwards compatibility)

UPDATE "miners" m
SET "poolAuth" = u."luxorSubaccountName"
FROM "users" u
WHERE m."userId" = u.id
  AND u."luxorSubaccountName" IS NOT NULL
  AND m."poolAuth" IS NULL;
