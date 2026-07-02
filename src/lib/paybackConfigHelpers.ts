import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type { PaybackConfig, PaybackProfileType } from "@prisma/client";

const DEFAULT_VALUES = {
  hostingCharges: "0.06300",
  monthlyInvoicingAmount: "199.05",
  powerConsumption: "3.5000",
  machineCapitalCost: "4050.95",
  poolCommissionStockOs: "2.50",
  poolCommissionLuxos: "2.50",
  s21proHashrateStockOs: "236.00",
  s21proHashrateLuxos: "252.00",
  s21xpHashrateStockOs: "236.00",
  s21xpHashrateLuxos: "252.00",
  breakevenBtcPrice: "63500.00",
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
  hostingCharges:
    overrides.hostingCharges ?? new Decimal(DEFAULT_VALUES.hostingCharges),
  monthlyInvoicingAmount:
    overrides.monthlyInvoicingAmount ??
    new Decimal(DEFAULT_VALUES.monthlyInvoicingAmount),
  powerConsumption:
    overrides.powerConsumption ?? new Decimal(DEFAULT_VALUES.powerConsumption),
  machineCapitalCost:
    overrides.machineCapitalCost ??
    new Decimal(DEFAULT_VALUES.machineCapitalCost),
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
    hostingCharges: Number(config.hostingCharges),
    monthlyInvoicingAmount: Number(config.monthlyInvoicingAmount),
    powerConsumption: Number(config.powerConsumption),
    machineCapitalCost: Number(config.machineCapitalCost),
    poolCommissionStockOs: Number(config.poolCommissionStockOs),
    poolCommissionLuxos: Number(config.poolCommissionLuxos),
    s21proHashrateStockOs: Number(config.s21proHashrateStockOs),
    s21proHashrateLuxos: Number(config.s21proHashrateLuxos),
    s21xpHashrateStockOs: Number(config.s21xpHashrateStockOs),
    s21xpHashrateLuxos: Number(config.s21xpHashrateLuxos),
    breakevenBtcPrice: Number(config.breakevenBtcPrice),
  };
}
