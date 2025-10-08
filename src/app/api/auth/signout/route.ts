import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    let userId: string | undefined;

    // Try to get user ID from token if available
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { userId: string };
        userId = decoded.userId;

        // Add token to blacklist
        await prisma.tokenBlacklist.create({
          data: {
            token,
            userId: decoded.userId,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
          },
        });

        // Log logout activity
        if (userId) {
          await prisma.userActivity.create({
            data: {
              userId,
              type: 'LOGOUT',
              ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
              userAgent: request.headers.get('user-agent') || 'unknown',
            },
          });
        }
      } catch (e) {
        // Token might be invalid, but we still want to clear cookies
        console.error('Error processing token during logout:', e);
      }
    }

    // Create a response that will clear the cookies
    const response = NextResponse.json(
      { message: 'Logged out successfully' },
      { status: 200 }
    );

    // Clear the auth cookies
    response.cookies.set('token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: new Date(0), // Immediately expire the cookie
    });

    response.cookies.set('refresh_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: new Date(0), // Immediately expire the cookie
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}