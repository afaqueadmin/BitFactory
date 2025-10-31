import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import { prisma } from '@/lib/prisma';
import {getUserInfoFromToken} from "@/lib/helpers/getUserInfoFromToken";

export async function POST(req: NextRequest) {
  try {
      const jwt = req.cookies.get('token')?.value;
      if (!jwt) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { userId } = getUserInfoFromToken(jwt);

      if (!userId) {
          return NextResponse.json({ error: 'Invalid token', userId }, { status: 401 });
      }

    const { token } = await req.json();

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Get user's secret
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });

    if (!user?.twoFactorSecret) {
      return NextResponse.json(
        { error: '2FA has not been set up' },
        { status: 400 }
      );
    }

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: token,
      window: 1, // Allow 1 time step before/after for clock drift
    });

    if (!verified) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 400 }
      );
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      Math.random().toString(36).substring(2, 8).toUpperCase()
    );

    // Enable 2FA and save backup codes
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: backupCodes,
      },
    });

    // Log the 2FA enablement
    await prisma.userActivity.create({
      data: {
        userId,
        type: '2FA_ENABLED',
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json({
      success: true,
      backupCodes,
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
