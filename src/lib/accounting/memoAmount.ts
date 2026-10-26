/**
 * memos.amount is stored as a deduction from the category's revenue
 * (revenue = total - sum(amount)). Internal memos are entered and shown as
 * the revenue effect instead (positive adds to the category), so their sign
 * is flipped between the UI and storage. Customer-facing memos keep the
 * stored sign, which drives the customer's balance and the Debit/Credit label.
 */
type MemoTypeValue = "CUSTOMER_FACING" | "INTERNAL";

export function memoDisplayAmount(memo: {
  memoType: MemoTypeValue;
  amount: number | string;
}): number {
  const amount = Number(memo.amount);
  return memo.memoType === "INTERNAL" ? -amount : amount;
}

export function memoStoredAmount(
  memoType: MemoTypeValue,
  displayAmount: number,
): number {
  return memoType === "INTERNAL" ? -displayAmount : displayAmount;
}
