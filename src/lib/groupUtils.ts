import { prisma } from "@/lib/prisma";

/**
 * Fetch a group by its subaccount name
 * Used to find the group and relationship manager for a customer
 */
export async function getGroupBySubaccountName(subaccountName: string) {
  try {
    const group = await prisma.group.findFirst({
      where: {
        subaccounts: {
          some: {
            subaccountName: subaccountName,
          },
        },
      },
      select: {
        id: true,
        name: true,
        relationshipManager: true,
        email: true,
      },
    });

    return group;
  } catch (error) {
    console.error("Error fetching group by subaccount name:", error);
    return null;
  }
}
