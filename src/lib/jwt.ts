import { SignJWT, jwtVerify, JWTPayload } from "jose";

export interface JwtPayload extends JWTPayload {
  userId: string;
  role: string;
  type?: string;
}

// Read lazily (not at import time) so builds and public pages still load when
// the variable is missing; auth operations fail closed instead of falling back
// to a guessable secret.
const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
};

export async function verifyJwtToken(token: string): Promise<JwtPayload> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ["HS256"], // Explicitly expect HS256
    });

    // Optional: debug
    // console.log('Decoded header:', protectedHeader);
    // console.log('Decoded payload:', payload);

    if (
      typeof payload.userId !== "string" ||
      typeof payload.role !== "string"
    ) {
      throw new Error("Invalid token payload structure");
    }

    // Blacklist check is skipped on Edge (middleware) - Prisma can't run
    // there. Sensitive server actions all go through Node-runtime API
    // routes, which do reach this check, so a token revoked at logout is
    // still rejected before it can do anything; only page-routing decisions
    // made by middleware itself don't see the revocation until the token's
    // own (short) expiry.
    if (process.env.NEXT_RUNTIME !== "edge") {
      const { isTokenBlacklisted } = await import("@/lib/auth/tokenBlacklist");
      if (await isTokenBlacklisted(token)) {
        throw new Error("Token has been revoked");
      }
    }

    return payload as JwtPayload;
  } catch (error) {
    console.error("verifyJwtToken error:", error);
    throw new Error("Invalid or expired token");
  }
}

export async function signJwtToken(
  payload: Omit<JwtPayload, "exp">,
  expiresIn: "1h" | "7d" | "2m" = "1h",
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecretKey());
}

export async function generateTokens(userId: string, role: string) {
  const accessToken = await signJwtToken({ userId, role });
  const refreshToken = await signJwtToken(
    { userId, role, type: "refresh" },
    "7d",
  );
  return { accessToken, refreshToken };
}
