import { PrismaClient } from "@prisma/client";
import { walletFieldEncryption } from "@/lib/walletFieldEncryption";

// Wallet addresses are encrypted at rest; the extension encrypts them on
// write, decrypts them on read and masks them in audit log text, for every
// query through this client (src/lib/walletFieldEncryption.ts).
//
// Typed as the plain PrismaClient on purpose: a query-only extension changes
// no argument or result types, while the extended client's own type isn't
// assignable to Prisma.TransactionClient, which much of the code passes
// `tx` around as. Interactive and batch transactions on this client still
// run through the extension.
function createClient(): PrismaClient {
  return new PrismaClient().$extends(
    walletFieldEncryption,
  ) as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
