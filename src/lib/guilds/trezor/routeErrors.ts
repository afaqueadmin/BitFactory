/** Errors from the Trezor payout code whose message is meant for the admin. */

import { GuildInputError } from "../accounts";
import { TrezorAccountError } from "./account";
import { TrezorSetupError } from "./device";
import { GuildWalletError } from "./guildWallet";
import { MempoolError } from "./mempool";
import { PayoutTxError, TrezorPayoutError } from "./payout";

export function trezorErrorMessage(error: unknown): string | null {
  if (
    error instanceof TrezorSetupError ||
    error instanceof GuildWalletError ||
    error instanceof TrezorPayoutError ||
    error instanceof PayoutTxError ||
    error instanceof TrezorAccountError ||
    error instanceof MempoolError ||
    error instanceof GuildInputError
  ) {
    return error.message;
  }
  return null;
}
