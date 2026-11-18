import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import {
  decryptResult,
  encryptWriteArgs,
  maskAuditData,
} from "@/lib/walletFieldEncryption";
import {
  decryptWalletAddress,
  encryptWalletAddress,
  isEncryptedWalletAddress,
  walletAddressHash,
} from "@/lib/walletCrypto";

const ORIGINAL = {
  enc: process.env.WALLET_ENCRYPTION_KEY,
  hash: process.env.WALLET_HASH_KEY,
};
const A = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const B = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";

beforeEach(() => {
  process.env.WALLET_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.WALLET_HASH_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  process.env.WALLET_ENCRYPTION_KEY = ORIGINAL.enc;
  process.env.WALLET_HASH_KEY = ORIGINAL.hash;
});

type Row = Record<string, unknown>;

describe("encryptWriteArgs", () => {
  it("encrypts a field and fills its hash", () => {
    const out = encryptWriteArgs("WalletChangeRequest", {
      data: { userId: "u1", currentAddress: A, requestedAddress: B },
    }) as { data: Row };
    expect(isEncryptedWalletAddress(out.data.currentAddress as string)).toBe(
      true,
    );
    expect(decryptWalletAddress(out.data.requestedAddress as string)).toBe(B);
    expect(out.data.currentAddressHash).toBe(walletAddressHash(A));
    expect(out.data.requestedAddressHash).toBe(walletAddressHash(B));
    expect(out.data.userId).toBe("u1");
  });

  it("clears the hash with a null", () => {
    const out = encryptWriteArgs("GuildMembership", {
      where: { id: "m" },
      data: { walletAddress: null },
    }) as { data: Row; where: Row };
    expect(out.data.walletAddress).toBeNull();
    expect(out.data.walletAddressHash).toBeNull();
    expect(out.where).toEqual({ id: "m" });
  });

  it("handles createMany arrays and upsert create/update", () => {
    const many = encryptWriteArgs("PoolTransaction", {
      data: [{ addressName: A }, { addressName: null }, { amount: 1 }],
      skipDuplicates: true,
    }) as { data: Row[] };
    expect(many.data[0].addressHash).toBe(walletAddressHash(A));
    expect(many.data[1].addressHash).toBeNull();
    expect(many.data[2]).toEqual({ amount: 1 });

    const up = encryptWriteArgs("Guild", {
      where: { id: "g" },
      create: { payoutAddress: A },
      update: { payoutAddress: { set: B } },
    }) as { create: Row; update: Row };
    expect(up.create.payoutAddressHash).toBe(walletAddressHash(A));
    const set = (up.update.payoutAddress as { set: string }).set;
    expect(decryptWalletAddress(set)).toBe(B);
    expect(up.update.payoutAddressHash).toBe(walletAddressHash(B));
  });

  it("reaches nested relation writes", () => {
    const out = encryptWriteArgs("Guild", {
      data: {
        name: "G",
        memberships: { create: [{ userId: "u", walletAddress: A }] },
      },
    }) as { data: { memberships: { create: Row[] } } };
    const m = out.data.memberships.create[0];
    expect(isEncryptedWalletAddress(m.walletAddress as string)).toBe(true);
    expect(m.walletAddressHash).toBe(walletAddressHash(A));
  });

  it("treats 'address' as a wallet only on client wallet models", () => {
    const street = encryptWriteArgs("Franchise", {
      data: { address: "12 Main Street" },
    }) as { data: Row };
    expect(street.data).toEqual({ address: "12 Main Street" });

    const wallet = encryptWriteArgs("ClientWallet", {
      data: { address: A, poolSubaccountId: "p" },
    }) as { data: Row };
    expect(isEncryptedWalletAddress(wallet.data.address as string)).toBe(true);
    expect(wallet.data.addressHash).toBe(walletAddressHash(A));
  });

  it("doesn't double-encrypt and keeps an explicit hash", () => {
    const stored = encryptWalletAddress(A);
    const out = encryptWriteArgs("GuildDistributionLine", {
      data: { walletSnapshot: stored, walletSnapshotHash: "given" },
    }) as { data: Row };
    expect(decryptWalletAddress(out.data.walletSnapshot as string)).toBe(A);
    expect(out.data.walletSnapshotHash).toBe("given");
  });

  it("leaves PoolSubaccount alone and Prisma null sentinels intact", () => {
    const sub = { data: { walletAddress: A } };
    expect(encryptWriteArgs("PoolSubaccount", sub)).toBe(sub);
    const json = encryptWriteArgs("GuildDistribution", {
      data: { hostingAllocations: Prisma.JsonNull },
    }) as { data: Row };
    expect(json.data.hostingAllocations).toBe(Prisma.JsonNull);
  });
});

describe("decryptResult", () => {
  it("decrypts at any depth and passes plaintext through", () => {
    const result = {
      id: "g",
      payoutAddress: encryptWalletAddress(A),
      memberships: [
        { walletAddress: encryptWalletAddress(B), joinedAt: new Date(0) },
        { walletAddress: "legacy-plain" },
      ],
      franchise: { address: "12 Main Street" },
      user: { twoFactorSecret: "enc:v1:not-a-wallet" },
    };
    decryptResult(result);
    expect(result.payoutAddress).toBe(A);
    expect(result.memberships[0].walletAddress).toBe(B);
    expect(result.memberships[0].joinedAt).toEqual(new Date(0));
    expect(result.memberships[1].walletAddress).toBe("legacy-plain");
    expect(result.franchise.address).toBe("12 Main Street");
    expect(result.user.twoFactorSecret).toBe("enc:v1:not-a-wallet");
  });

  it("handles null, counts and arrays of rows", () => {
    expect(decryptResult(null)).toBeNull();
    expect(decryptResult(5)).toBe(5);
    const rows = [{ addressName: encryptWalletAddress(A) }];
    decryptResult(rows);
    expect(rows[0].addressName).toBe(A);
  });
});

describe("maskAuditData", () => {
  it("masks addresses in description and changes", () => {
    const out = maskAuditData({
      action: "WALLET_CHANGE_APPROVED",
      description: `Wallet change approved: ${B} -> ${A}`,
      changes: JSON.stringify({ requestedAddress: { from: B, to: A } }),
    }) as Row;
    expect(out.description).toBe(
      "Wallet change approved: 1BvBMS…JaNVN2 -> bc1qar…wf5mdq",
    );
    expect(out.changes as string).not.toContain(A);
    expect(out.changes as string).toContain("bc1qar…wf5mdq");
    expect(out.action).toBe("WALLET_CHANGE_APPROVED");
  });

  it("masks inside object changes too", () => {
    const out = maskAuditData([
      { description: "x", changes: { before: { payoutAddress: A } } },
    ]) as Row[];
    expect(out[0].changes).toEqual({
      before: { payoutAddress: "bc1qar…wf5mdq" },
    });
  });
});
