import { Prisma } from "@prisma/client";
import {
  bankTransferReceiptHref,
  isInterCompany,
} from "@/lib/accounting/bankTransfer";

const bankSelect = {
  id: true,
  name: true,
  isActive: true,
  entity: { select: { id: true, name: true } },
} as const;

export const transferInclude = {
  fromBank: { select: bankSelect },
  toBank: { select: bankSelect },
  fromCurrency: { select: { id: true, code: true } },
  toCurrency: { select: { id: true, code: true } },
  createdByUser: { select: { name: true, email: true } },
} satisfies Prisma.AccountingBankTransferInclude;

type TransferWithRelations = Prisma.AccountingBankTransferGetPayload<{
  include: typeof transferInclude;
}>;

/** A transfer as JSON (Decimals as strings, the date as YYYY-MM-DD). */
export function transferJson(t: TransferWithRelations) {
  const side = (
    bank: TransferWithRelations["fromBank"],
    currency: TransferWithRelations["fromCurrency"],
    amount: Prisma.Decimal,
    fee: Prisma.Decimal,
    exchangeRate: Prisma.Decimal,
    feeUsd: Prisma.Decimal,
  ) => ({
    entityId: bank.entity.id,
    entityName: bank.entity.name,
    bankId: bank.id,
    bankName: bank.name,
    bankActive: bank.isActive,
    currencyId: currency.id,
    currencyCode: currency.code,
    amount: amount.toFixed(2),
    fee: fee.toFixed(2),
    exchangeRate: exchangeRate.toString(),
    feeUsd: feeUsd.toFixed(2),
  });
  return {
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    from: side(
      t.fromBank,
      t.fromCurrency,
      t.fromAmount,
      t.fromFee,
      t.fromExchangeRate,
      t.fromFeeUsd,
    ),
    to: side(
      t.toBank,
      t.toCurrency,
      t.toAmount,
      t.toFee,
      t.toExchangeRate,
      t.toFeeUsd,
    ),
    conversionRate: t.conversionRate.toString(),
    amountUsd: t.amountUsd.toFixed(2),
    interCompany: isInterCompany({
      fromEntityName: t.fromBank.entity.name,
      toEntityName: t.toBank.entity.name,
    }),
    reference: t.reference,
    note: t.note,
    receiptKey: t.receiptKey,
    receiptHref: t.receiptKey ? bankTransferReceiptHref(t.id) : null,
    createdBy: t.createdByUser.name?.trim() || t.createdByUser.email,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
