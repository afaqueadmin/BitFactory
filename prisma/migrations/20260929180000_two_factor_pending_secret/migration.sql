-- C-2: 2FA setup writes the new secret here instead of over the live one, so
-- starting (or abandoning) setup never switches off an account's working 2FA.
ALTER TABLE "two_factor_auth" ADD COLUMN "pendingSecret" TEXT;
