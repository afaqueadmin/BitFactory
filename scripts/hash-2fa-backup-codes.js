/**
 * H-2 one-off data migration. Run AFTER the H-2 code is deployed (the new code
 * accepts both plaintext and hashed codes; the old code only plaintext).
 *
 * 1. Hashes every plaintext code in two_factor_auth."backupCodes" in place
 *    with bcrypt - users keep the codes they saved.
 * 2. Clears the legacy users."twoFactorSecret" / "twoFactorBackupCodes"
 *    columns: stale copies from before the TwoFactorAuth table, still equal
 *    to the live secret and codes, read by no code.
 *
 * Dry run by default (counts only). Pass --apply to write.
 *   node --env-file=.env scripts/hash-2fa-backup-codes.js [--apply]
 *
 * Idempotent: already-hashed codes and already-cleared columns are skipped.
 */
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcrypt");

const HASH_ROUNDS = 10; // must match src/lib/auth/backupCodes.ts
const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const isHashed = (code) => code.startsWith("$2");

async function connectWithRetry(attempts = 6) {
  for (let i = 1; ; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      if (i >= attempts) throw error;
      console.log(`connect attempt ${i} failed, retrying in 5s`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function main() {
  await connectWithRetry();
  console.log(
    APPLY ? "APPLYING changes" : "DRY RUN - no changes (pass --apply to write)",
  );

  const rows = await prisma.twoFactorAuth.findMany({
    select: { userId: true, backupCodes: true },
  });
  const pending = rows.filter((r) => r.backupCodes.some((c) => !isHashed(c)));
  const plaintextCount = pending.reduce(
    (n, r) => n + r.backupCodes.filter((c) => !isHashed(c)).length,
    0,
  );
  console.log(
    `two_factor_auth: ${pending.length} row(s) with ${plaintextCount} plaintext code(s)`,
  );

  let hashedRows = 0;
  if (APPLY) {
    for (const row of pending) {
      const next = await Promise.all(
        row.backupCodes.map((c) => (isHashed(c) ? c : hash(c, HASH_ROUNDS))),
      );
      // Only write if the codes haven't changed since we read them (a code
      // used or regenerated meanwhile) - otherwise skip; a re-run picks it up.
      const { count } = await prisma.twoFactorAuth.updateMany({
        where: { userId: row.userId, backupCodes: { equals: row.backupCodes } },
        data: { backupCodes: { set: next } },
      });
      if (count === 1) hashedRows++;
      else
        console.log(
          `  skipped a row that changed during the run (re-run to finish)`,
        );
    }
    console.log(`  hashed ${hashedRows} row(s)`);
  }

  const legacyWhere = {
    OR: [
      { twoFactorSecret: { not: null } },
      { twoFactorBackupCodes: { isEmpty: false } },
    ],
  };
  const legacy = await prisma.user.count({ where: legacyWhere });
  console.log(
    `users: ${legacy} row(s) with legacy twoFactorSecret/twoFactorBackupCodes`,
  );
  if (APPLY && legacy > 0) {
    const { count } = await prisma.user.updateMany({
      where: legacyWhere,
      data: { twoFactorSecret: null, twoFactorBackupCodes: { set: [] } },
    });
    console.log(`  cleared ${count} row(s)`);
  }

  // Verify.
  const after = await prisma.twoFactorAuth.findMany({
    select: { backupCodes: true },
  });
  const stillPlain = after.reduce(
    (n, r) => n + r.backupCodes.filter((c) => !isHashed(c)).length,
    0,
  );
  const legacyAfter = await prisma.user.count({ where: legacyWhere });
  console.log(
    `after: ${stillPlain} plaintext code(s) remaining, ${legacyAfter} legacy row(s) remaining`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
