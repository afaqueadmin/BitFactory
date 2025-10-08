import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';

// Helper function to verify JWT
const verifyToken = async (token: string): Promise<{ userId: string } | null> => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { userId: string };
    return decoded;
  } catch (error) {
    return null;
  }
};

// Helper function to verify refresh token
const verifyRefreshToken = async (token: string): Promise<{ userId: string } | null> => {
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'
    ) as { userId: string, type: 'refresh' };
    
    if (decoded.type !== 'refresh') {
      return null;
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
};

// Generate new tokens
const generateTokens = (userId: string) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('token')?.value;
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        { isAuthenticated: false },
        { status: 401 }
      );
    }

    // Try to verify the access token first
    if (accessToken) {
      const decoded = await verifyToken(accessToken);
      if (decoded) {
        // Get user data
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { 
            id: true,
            email: true,
            name: true,
          }
        });

        if (user) {
          return NextResponse.json({
            isAuthenticated: true,
            user
          });
        }
      }
    }

    // If access token is invalid or expired, try refresh token
    if (refreshToken) {
      const decoded = await verifyRefreshToken(refreshToken);
      if (decoded) {
        // Get user data
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            name: true,
          }
        });

        if (user) {
          // Generate new tokens
          const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id);

          // Create response with new tokens
          const response = NextResponse.json({
            isAuthenticated: true,
            user
          });

          // Set new cookies
          response.cookies.set('token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60, // 15 minutes
            path: '/',
          });

          response.cookies.set('refresh_token', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60, // 7 days
            path: '/',
          });

          return response;
        }
      }
    }

    // If both tokens are invalid
    const response = NextResponse.json(
      { isAuthenticated: false },
      { status: 401 }
    );

    // Clear invalid cookies
    ['token', 'refresh_token'].forEach(cookieName => {
      response.cookies.set(cookieName, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0,
        path: '/',
        expires: new Date(0),
      });
    });

    return response;
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}