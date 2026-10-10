import { prisma } from "@/lib/prisma";

/**
 * Customer fields needed to build an invoice number - their oldest Luxor
 * subaccount (PoolAuth), so the prefix stays the same no matter how many
 * more they're given later.
 */
export const INVOICE_NUMBER_CUSTOMER_SELECT = {
  name: true,
  segment: true,
  poolAuths: {
    where: { pool: { name: "Luxor" } },
    orderBy: { createdAt: "asc" as const },
    take: 1,
    select: { authKey: true },
  },
};

/**
 * Next invoice number for a customer: luxorIdentifier-YYYYMMDD-sequence,
 * where the sequence is a cumulative per-customer counter (not daily).
 */
export async function nextInvoiceNumber(
  customerId: string,
  customer: { name: string | null; poolAuths: Array<{ authKey: string }> },
  timestamp: Date,
): Promise<string> {
  // Prefer the Luxor subaccount identifier; fall back to the customer's
  // first name when no subaccount is assigned so invoice numbers stay
  // human-readable instead of blocking invoice creation.
  const luxorIdentifier =
    customer.poolAuths[0]?.authKey ||
    customer.name?.trim().split(/\s+/)[0] ||
    "Customer";

  const dateStr = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}`;

  // Get last invoice for this customer (cumulative counter, not daily)
  const customerLastInvoice = await prisma.invoice.findFirst({
    where: {
      userId: customerId,
    },
    select: { invoiceNumber: true },
    orderBy: { createdAt: "desc" },
  });

  // Extract sequence number from last invoice and increment
  // Format: subaccount-YYYYMMDD-XXX where XXX is the sequence
  const lastSeq = customerLastInvoice
    ? parseInt(customerLastInvoice.invoiceNumber.split("-").pop() || "0", 10) ||
      0
    : 0;
  const sequenceNumber = String(lastSeq + 1).padStart(3, "0");
  return `${luxorIdentifier}-${dateStr}-${sequenceNumber}`;
}
