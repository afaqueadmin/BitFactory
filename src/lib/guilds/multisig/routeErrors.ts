/** Errors from the multisig code that are safe to show the admin as they are. */

import { AppKeyError } from "./appKey";
import { DescriptorError } from "./descriptor";
import { MempoolError } from "./mempool";
import { MultisigPayoutError } from "./payout";
import { PayoutTxError } from "./psbt";
import { WalletSetupError } from "./wallet";

export function multisigErrorMessage(error: unknown): string | null {
  if (
    error instanceof WalletSetupError ||
    error instanceof MultisigPayoutError ||
    error instanceof PayoutTxError ||
    error instanceof DescriptorError ||
    error instanceof AppKeyError ||
    error instanceof MempoolError
  ) {
    return error.message;
  }
  return null;
}
