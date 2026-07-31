import { prisma } from "@/lib/prisma";

/**
 * Fetch a group by a customer's user id
 * Used to find the group and relationship manager for a customer
 */
export async function getGroupByUserId(userId: string) {
  try {
    const group = await prisma.group.findFirst({
      where: {
        subaccounts: {
          some: {
            poolAuth: {
              userId: userId,
            },
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
    console.error("Error fetching group by user id:", error);
    return null;
  }
}
