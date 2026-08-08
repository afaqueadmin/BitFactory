-- Data-only fix: existing audit_logs rows written before the CreditMemo ->
-- Memo rename still have entityType = 'CreditMemo' (a plain text column,
-- not an enum, so the earlier schema rename didn't touch it). Update them
-- to 'Memo' so historical audit trail lookups (which now query
-- entityType = 'Memo') keep finding these rows. No rows are removed.
UPDATE "audit_logs" SET "entityType" = 'Memo' WHERE "entityType" = 'CreditMemo';
