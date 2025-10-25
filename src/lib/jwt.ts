import { SignJWT, jwtVerify, JWTPayload } from 'jose';

export interface JwtPayload extends JWTPayload {
  userId: string;
  role: string;
  type?: string;
}

const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  return new TextEncoder().encode(secret);
};

export async function verifyJwtToken(token: string): Promise<JwtPayload> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ['HS256'], // Explicitly expect HS256
    });

    // Optional: debug
    // console.log('Decoded header:', protectedHeader);
    // console.log('Decoded payload:', payload);

    if (
      typeof payload.userId !== 'string' ||
      typeof payload.role !== 'string'
    ) {
      throw new Error('Invalid token payload structure');
    }

    return payload as JwtPayload;
  } catch (error) {
    console.error('verifyJwtToken error:', error);
    throw new Error('Invalid or expired token');
  }
}

export async function signJwtToken(
  payload: Omit<JwtPayload, 'exp'>,
  duration: '15m' | '7d' = '15m'
): Promise<string> {
  const expiresIn = duration === '7d' ? '7d' : '15m';

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecretKey());
}

export async function generateTokens(userId: string, role: string) {
  const accessToken = await signJwtToken({ userId, role });
  const refreshToken = await signJwtToken({ userId, role, type: 'refresh' }, '7d');
  return { accessToken, refreshToken };
}