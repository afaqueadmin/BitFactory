-- AddEnumValue INVOICE_PAID to AuditAction if it does not exist
-- AddEnumValue INVOICE_CANCELLED to NotificationType if it does not exist

DO $$
BEGIN
  -- Add INVOICE_PAID to AuditAction enum if it does not exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'INVOICE_PAID' AND enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'AuditAction'
    )
  ) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_PAID';
  END IF;

  -- Add INVOICE_CANCELLED to NotificationType enum if it does not exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'INVOICE_CANCELLED' AND enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'NotificationType'
    )
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_CANCELLED';
  END IF;
END $$;

