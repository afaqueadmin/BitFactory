/**
 * One-off data migration: encrypts the authenticator-app secrets in
 * two_factor_auth ("secret" and "pendingSecret") with TOTP_ENCRYPTION_KEY.
 * Run AFTER the encryption code is deployed with the same key set (the new
 * code reads both plaintext and encrypted secrets; the old code only
 * plaintext).
 *
 * Dry run by default (counts only, and checks the key can decrypt every
 * already-encrypted secret). Pass --apply to write.
 *   node --env-file=.env scripts/encrypt-2fa-secrets.js [--apply] [--only-user=<id>]
 *
 * Idempotent: already-encrypted secrets are skipped. Each value is checked to
 * decrypt back to the original before it's written, and only written if the
 * row hasn't changed since it was read.
 *
 * The format must match src/lib/auth/totpSecret.ts.
 */
const { PrismaClient } = require("@prisma/client");
const { createCipheriv, createDecipheriv, randomBytes } = require("crypto");

const PREFIX = "enc:v1:";
const AAD = Buffer.from("bitfactory-totp-secret");
const APPLY = process.argv.includes("--apply");
// --only-user=<id> limits the run to one account (for trying it on a test
// user before touching real data).
const ONLY_USER = process.argv
  .find((a) => a.startsWith("--only-user="))
  ?.slice("--only-user=".length);
const prisma = new PrismaClient();

function key() {
  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOTP_ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32)
    throw new Error("TOTP_ENCRYPTION_KEY must be 32 bytes, base64");
  return k;
}

function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(AAD);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return (
    PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")
  );
}

function decrypt(stored) {
  const data = Buffer.from(stored.slice(PREFIX.length), "base64");
  const d = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  d.setAAD(AAD);
  d.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([d.update(data.subarray(28)), d.final()]).toString(
    "utf8",
  );
}

const isEncrypted = (v) => typeof v === "string" && v.startsWith(PREFIX);
const isPlain = (v) => typeof v === "string" && v.length > 0 && !isEncrypted(v);

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
  key(); // fail fast if the key is missing or malformed
  await connectWithRetry();
  console.log(
    APPLY ? "APPLYING changes" : "DRY RUN - no changes (pass --apply to write)",
  );

  const where = ONLY_USER ? { userId: ONLY_USER } : {};
  if (ONLY_USER) console.log(`limited to user ${ONLY_USER}`);
  const rows = await prisma.twoFactorAuth.findMany({
    where,
    select: { userId: true, secret: true, pendingSecret: true },
  });

  // The key must open every secret that's already encrypted - otherwise it's
  // the wrong key and writing more with it would split the data.
  let undecryptable = 0;
  for (const r of rows) {
    for (const v of [r.secret, r.pendingSecret]) {
      if (isEncrypted(v)) {
        try {
          decrypt(v);
        } catch {
          undecryptable++;
        }
      }
    }
  }
  if (undecryptable > 0) {
    throw new Error(
      `${undecryptable} encrypted secret(s) don't decrypt with this key - wrong TOTP_ENCRYPTION_KEY? Nothing written.`,
    );
  }

  const pending = rows.filter(
    (r) => isPlain(r.secret) || isPlain(r.pendingSecret),
  );
  console.log(
    `two_factor_auth: ${rows.length} row(s), ${pending.length} with a plaintext secret`,
  );

  let done = 0;
  if (APPLY) {
    for (const r of pending) {
      const data = {};
      for (const field of ["secret", "pendingSecret"]) {
        if (isPlain(r[field])) {
          const enc = encrypt(r[field]);
          if (decrypt(enc) !== r[field])
            throw new Error("round-trip check failed");
          data[field] = enc;
        }
      }
      const { count } = await prisma.twoFactorAuth.updateMany({
        where: {
          userId: r.userId,
          secret: r.secret,
          pendingSecret: r.pendingSecret,
        },
        data,
      });
      if (count === 1) done++;
      else
        console.log(
          "  skipped a row that changed during the run (re-run to finish)",
        );
    }
    console.log(`  encrypted ${done} row(s)`);
  }

  const after = await prisma.twoFactorAuth.findMany({
    where,
    select: { secret: true, pendingSecret: true },
  });
  const stillPlain = after.filter(
    (r) => isPlain(r.secret) || isPlain(r.pendingSecret),
  ).length;
  console.log(`after: ${stillPlain} row(s) with a plaintext secret remaining`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
