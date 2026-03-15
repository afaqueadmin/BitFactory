-- AddColumn ccEmails to invoice_notifications if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_notifications' AND column_name = 'ccEmails'
  ) THEN
    ALTER TABLE "invoice_notifications" ADD COLUMN "ccEmails" TEXT;
  END IF;
END $$;


