// Helper to get user ID (the account) and login ID (which of the account's
// sign-in emails the session belongs to) from token
import { verifyJwtToken } from "@/lib/jwt";

export const getUserInfoFromToken = async (
  token: string,
): Promise<{ userId: string | null; loginId: string | null }> => {
  try {
    const { userId, loginId } = await verifyJwtToken(token);
    return { userId, loginId };
  } catch {
    return { userId: null, loginId: null };
  }
};
