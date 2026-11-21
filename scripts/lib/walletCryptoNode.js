// Plain-Node copy of src/lib/walletCrypto.ts for the pg-based scripts, which
// can't import the TypeScript app code. Must produce exactly what the app
// reads: src/lib/__tests__/walletCryptoNode.test.ts checks the two agree.
const {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} = require("crypto");

const PREFIX = "enc:v1:";
const AAD = Buffer.from("bitfactory-wallet-address");

function loadKey(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} environment variable is not set`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32)
    throw new Error(`${name} must be 32 bytes, base64-encoded`);
  return key;
}

const isEncrypted = (s) => typeof s === "string" && s.startsWith(PREFIX);

function normalize(address) {
  const t = address.trim();
  return /^(bc1|tb1|bcrt1)/i.test(t) ? t.toLowerCase() : t;
}

function encrypt(address) {
  if (isEncrypted(address)) return address;
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    loadKey("WALLET_ENCRYPTION_KEY"),
    iv,
  );
  cipher.setAAD(AAD);
  const ct = Buffer.concat([
    cipher.update(address.trim(), "utf8"),
    cipher.final(),
  ]);
  return (
    PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")
  );
}

function decrypt(stored) {
  if (!isEncrypted(stored)) return stored;
  const data = Buffer.from(stored.slice(PREFIX.length), "base64");
  const d = createDecipheriv(
    "aes-256-gcm",
    loadKey("WALLET_ENCRYPTION_KEY"),
    data.subarray(0, 12),
  );
  d.setAAD(AAD);
  d.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([d.update(data.subarray(28)), d.final()]).toString(
    "utf8",
  );
}

function hash(address) {
  return createHmac("sha256", loadKey("WALLET_HASH_KEY"))
    .update(normalize(decrypt(address)))
    .digest("hex");
}

function mask(address) {
  if (address == null) return address;
  const a = String(address).trim();
  if (!a) return a;
  if (isEncrypted(a)) return "••••••";
  if (a.length <= 14) return `…${a.slice(-4)}`;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

const ADDRESS_IN_TEXT =
  /\b(?:bc1|tb1|bcrt1)[02-9ac-hj-np-z]{8,87}\b|\b(?:BC1|TB1)[02-9AC-HJ-NP-Z]{8,87}\b|\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g;

const maskText = (text) =>
  text == null ? text : String(text).replace(ADDRESS_IN_TEXT, (m) => mask(m));

module.exports = {
  PREFIX,
  isEncrypted,
  normalize,
  encrypt,
  decrypt,
  hash,
  mask,
  maskText,
};
