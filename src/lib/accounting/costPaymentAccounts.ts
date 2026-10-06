import { Prisma } from "@prisma/client";

/**
 * Payment-account fields on CostPayment (Phase 2): the receiving entity,
 * bank and currency, the amount as entered, the rate and the payment date.
 * Admins see them; customers and franchisees never do (§2c P2-1).
 */

/** Relations returned with each payment on admin invoice responses. */
export const costPaymentAccountInclude = {
  entity: { select: { id: true, name: true } },
  bank: { select: { id: true, name: true } },
  currency: { select: { id: true, code: true, name: true } },
} satisfies Prisma.CostPaymentInclude;

/** Columns stripped from payment rows sent to non-admins. */
export const costPaymentAccountOmit = {
  entityId: true,
  bankId: true,
  currencyId: true,
  originalAmount: true,
  exchangeRate: true,
  paymentDate: true,
} satisfies Prisma.CostPaymentOmit;
