import { prisma } from "@/lib/prisma";

/**
 * Generate a unique franchise code from the business name, e.g. "ACME-4F2B"
 */
export async function generateFranchiseCode(
  businessName: string,
): Promise<string> {
  const prefix =
    businessName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6) || "FRAN";

  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Math.random().toString(36).slice(-4).toUpperCase();
    const code = `${prefix}-${suffix}`;
    const existing = await prisma.franchise.findUnique({
      where: { franchiseCode: code },
    });
    if (!existing) {
      return code;
    }
  }

  throw new Error("Failed to generate a unique franchise code");
}
