-- AlterColumn email and relationshipManager to VARCHAR(255) in groups
ALTER TABLE "groups" ALTER COLUMN "email" SET DATA TYPE VARCHAR(255);
ALTER TABLE "groups" ALTER COLUMN "relationshipManager" SET DATA TYPE VARCHAR(255);

