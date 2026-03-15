-- AddColumn email to groups if it does not exist
-- AddColumn relationshipManager to groups if it does not exist
-- AddForeignKey constraint on createdBy to groups if it does not exist

DO $$
BEGIN
  -- Add email column if it does not exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'groups' AND column_name = 'email'
  ) THEN
    ALTER TABLE "groups" ADD COLUMN "email" TEXT;
  END IF;

  -- Add relationshipManager column if it does not exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'groups' AND column_name = 'relationshipManager'
  ) THEN
    ALTER TABLE "groups" ADD COLUMN "relationshipManager" TEXT;
  END IF;

  -- Add foreign key constraint on createdBy if it does not exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'groups' AND constraint_name = 'groups_createdBy_fkey'
  ) THEN
    ALTER TABLE "groups" ADD CONSTRAINT "groups_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "users"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

