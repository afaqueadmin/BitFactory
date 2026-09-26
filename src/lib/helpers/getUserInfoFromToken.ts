// Helper to get user ID from token
import { verifyJwtToken } from "@/lib/jwt";

export const getUserInfoFromToken = async (
  token: string,
): Promise<{ userId: string | null }> => {
  try {
    const { userId } = await verifyJwtToken(token);
    return { userId };
  } catch {
    return { userId: null };
  }
};
