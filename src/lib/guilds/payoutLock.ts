/**
 * While a guild's Trezor payout is prepared but not signed, its wallets and
 * split stay as they were: the prepared transaction pays the wallets and
 * amounts of that moment, and the server checks the signed one against the
 * database before broadcasting - a change in between would only make that
 * check fail. Sign or cancel the payout first.
 */

import type { Prisma } from "@prisma/client";
import { GuildInputError } from "./accounts";

export async function assertNoPayoutAwaitingSignature(
  tx: Prisma.TransactionClient,
  guildId: string,
) {
  const open = await tx.guildPayoutBatch.findFirst({
    where: { guildId, status: "AWAITING_SIGNATURE" },
    select: { id: true },
  });
  if (open) {
    throw new GuildInputError(
      "A payout for this guild is waiting to be signed - sign or cancel it first",
    );
  }
}
