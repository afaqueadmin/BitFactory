// Helper to get user ID from token
import jwt from "jsonwebtoken";

export const getUserInfoFromToken = (token: string) => {
  try {
    const decodedObject = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    ) as { userId: string };
    return decodedObject;
  } catch {
    return { userId: null };
  }
};
