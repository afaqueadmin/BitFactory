-- M-4: an email identifies at most one account, case-insensitively.
-- Covers soft-deleted rows too: a deleted account keeps its email, and the
-- existing plain unique constraint already blocks reusing it exactly.
--
-- Prisma's schema can't express an expression index, so this lives only here
-- (see the comment on User.email in schema.prisma). If `prisma migrate dev`
-- ever proposes dropping "users_email_lower_key", that's drift - don't accept it.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
