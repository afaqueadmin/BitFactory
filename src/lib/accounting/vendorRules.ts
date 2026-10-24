import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Usage counts returned with each vendor (and checked before a delete). */
export const vendorCountInclude = {
  _count: {
    select: {
      hardwarePurchases: true,
      vendorInvoices: true,
      depositMovements: true,
    },
  },
} satisfies Prisma.AccountingVendorInclude;

/** Which invoice forms a vendor is offered on. */
export type VendorInvoiceType = "hardware" | "farm";

/** The vendor fields every invoice response carries. */
export const vendorSelect = {
  select: { id: true, name: true, isActive: true },
} as const;

const TYPE_LABELS: Record<VendorInvoiceType, string> = {
  hardware: "Hardware Purchases",
  farm: "Farm Tariffs",
};

/**
 * Checks the vendor picked on a Hardware Purchase / Farm Tariff invoice:
 * it must exist and, unless it is the invoice's current vendor (an edit that
 * keeps it), be active and tagged for that invoice type. A vendor that was
 * deactivated or untagged later can still stay on its existing invoices.
 */
export async function checkVendorForInvoice(
  vendorId: unknown,
  type: VendorInvoiceType,
  currentVendorId?: string | null,
): Promise<{ vendorId: string } | { error: string }> {
  if (typeof vendorId !== "string" || !vendorId) {
    return { error: "Vendor is required" };
  }
  const vendor = await prisma.accountingVendor.findUnique({
    where: { id: vendorId },
  });
  if (!vendor) {
    return { error: "The selected vendor was not found" };
  }
  if (vendorId === currentVendorId) {
    return { vendorId };
  }
  const tagged =
    type === "hardware" ? vendor.forHardwarePurchases : vendor.forFarmTariffs;
  if (!vendor.isActive || !tagged) {
    return {
      error: `${vendor.name} is not an active vendor for ${TYPE_LABELS[type]}`,
    };
  }
  return { vendorId };
}
