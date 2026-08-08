import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type { PaybackConfig, PaybackProfileType } from "@prisma/client";

const DEFAULT_VALUES = {
  s21proHostingCharges: "0.06300",
  s21xpHostingCharges: "0.06300",
  s21proMonthlyInvoicingAmount: "199.05",
  s21xpMonthlyInvoicingAmount: "199.05",
  s21proPowerConsumption: "3.5000",
  s21xpPowerConsumption: "3.5000",
  s21proMachineCost: "4050.95",
  s21xpMachineCost: "4050.95",
  poolCommissionStockOs: "2.50",
  poolCommissionLuxos: "2.50",
  s21proHashrateStockOs: "236.00",
  s21proHashrateLuxos: "252.00",
  s21xpHashrateStockOs: "236.00",
  s21xpHashrateLuxos: "252.00",
  breakevenBtcPrice: "63500.00",
  defaultInvoicedAmount: "4250.00",
} as const;

const DECIMAL_FIELDS = Object.keys(DEFAULT_VALUES) as Array<
  keyof typeof DEFAULT_VALUES
>;

export const toDecimalIfValid = (value: unknown): Decimal | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const numValue =
    typeof value === "string" ? parseFloat(value) : Number(value);
  if (isNaN(numValue)) {
    return undefined;
  }
  return new Decimal(numValue);
};

const buildDefaultData = (
  profileType: PaybackProfileType,
  overrides: Partial<Record<keyof typeof DEFAULT_VALUES, Decimal>>,
) => ({
  profileType,
  s21proHostingCharges:
    overrides.s21proHostingCharges ??
    new Decimal(DEFAULT_VALUES.s21proHostingCharges),
  s21xpHostingCharges:
    overrides.s21xpHostingCharges ??
    new Decimal(DEFAULT_VALUES.s21xpHostingCharges),
  s21proMonthlyInvoicingAmount:
    overrides.s21proMonthlyInvoicingAmount ??
    new Decimal(DEFAULT_VALUES.s21proMonthlyInvoicingAmount),
  s21xpMonthlyInvoicingAmount:
    overrides.s21xpMonthlyInvoicingAmount ??
    new Decimal(DEFAULT_VALUES.s21xpMonthlyInvoicingAmount),
  s21proPowerConsumption:
    overrides.s21proPowerConsumption ??
    new Decimal(DEFAULT_VALUES.s21proPowerConsumption),
  s21xpPowerConsumption:
    overrides.s21xpPowerConsumption ??
    new Decimal(DEFAULT_VALUES.s21xpPowerConsumption),
  s21proMachineCost:
    overrides.s21proMachineCost ??
    new Decimal(DEFAULT_VALUES.s21proMachineCost),
  s21xpMachineCost:
    overrides.s21xpMachineCost ?? new Decimal(DEFAULT_VALUES.s21xpMachineCost),
  poolCommissionStockOs:
    overrides.poolCommissionStockOs ??
    new Decimal(DEFAULT_VALUES.poolCommissionStockOs),
  poolCommissionLuxos:
    overrides.poolCommissionLuxos ??
    new Decimal(DEFAULT_VALUES.poolCommissionLuxos),
  s21proHashrateStockOs:
    overrides.s21proHashrateStockOs ??
    new Decimal(DEFAULT_VALUES.s21proHashrateStockOs),
  s21proHashrateLuxos:
    overrides.s21proHashrateLuxos ??
    new Decimal(DEFAULT_VALUES.s21proHashrateLuxos),
  s21xpHashrateStockOs:
    overrides.s21xpHashrateStockOs ??
    new Decimal(DEFAULT_VALUES.s21xpHashrateStockOs),
  s21xpHashrateLuxos:
    overrides.s21xpHashrateLuxos ??
    new Decimal(DEFAULT_VALUES.s21xpHashrateLuxos),
  breakevenBtcPrice:
    overrides.breakevenBtcPrice ??
    new Decimal(DEFAULT_VALUES.breakevenBtcPrice),
  defaultInvoicedAmount:
    overrides.defaultInvoicedAmount ??
    new Decimal(DEFAULT_VALUES.defaultInvoicedAmount),
});

export async function getOrCreatePaybackConfig(
  profileType: PaybackProfileType,
) {
  const existing = await prisma.paybackConfig.findFirst({
    where: { profileType },
  });
  if (existing) return existing;

  return prisma.paybackConfig.create({
    data: buildDefaultData(profileType, {}),
  });
}

export async function updatePaybackConfig(
  profileType: PaybackProfileType,
  body: Record<string, unknown>,
) {
  const updateData: Partial<Record<keyof typeof DEFAULT_VALUES, Decimal>> = {};
  for (const field of DECIMAL_FIELDS) {
    const value = toDecimalIfValid(body[field]);
    if (value !== undefined) {
      updateData[field] = value;
    }
  }

  const existing = await prisma.paybackConfig.findFirst({
    where: { profileType },
  });

  if (!existing) {
    return prisma.paybackConfig.create({
      data: buildDefaultData(profileType, updateData),
    });
  }

  return prisma.paybackConfig.update({
    where: { id: existing.id },
    data: updateData,
  });
}

export function serializePaybackConfig(config: PaybackConfig) {
  return {
    s21proHostingCharges: Number(config.s21proHostingCharges),
    s21xpHostingCharges: Number(config.s21xpHostingCharges),
    s21proMonthlyInvoicingAmount: Number(config.s21proMonthlyInvoicingAmount),
    s21xpMonthlyInvoicingAmount: Number(config.s21xpMonthlyInvoicingAmount),
    s21proPowerConsumption: Number(config.s21proPowerConsumption),
    s21xpPowerConsumption: Number(config.s21xpPowerConsumption),
    s21proMachineCost: Number(config.s21proMachineCost),
    s21xpMachineCost: Number(config.s21xpMachineCost),
    poolCommissionStockOs: Number(config.poolCommissionStockOs),
    poolCommissionLuxos: Number(config.poolCommissionLuxos),
    s21proHashrateStockOs: Number(config.s21proHashrateStockOs),
    s21proHashrateLuxos: Number(config.s21proHashrateLuxos),
    s21xpHashrateStockOs: Number(config.s21xpHashrateStockOs),
    s21xpHashrateLuxos: Number(config.s21xpHashrateLuxos),
    breakevenBtcPrice: Number(config.breakevenBtcPrice),
    defaultInvoicedAmount: Number(config.defaultInvoicedAmount),
  };
}
