import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import { prisma } from '@/lib/prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import generateTokens from "@/lib/helpers/generateTokens";

export async function POST(req: NextRequest) {
  try {
    // Get request body
    const { email, token } = await req.json();
    // For login validation
      if (!email || !token) {
        return NextResponse.json(
          { error: 'Email and token are required' },
          { status: 400 }
        );
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          twoFactorSecret: true,
          twoFactorEnabled: true,
          twoFactorBackupCodes: true,
          role: true
        },
      });

      if (!user?.twoFactorEnabled) {
        return NextResponse.json(
          { error: '2FA is not enabled for this user' },
          { status: 400 }
        );
      }

      // First check if it's a backup code
      if (user.twoFactorBackupCodes?.includes(token)) {
        // Remove the used backup code
        await prisma.user.update({
          where: { email },
          data: {
            twoFactorBackupCodes: {
              set: user.twoFactorBackupCodes.filter(code => code !== token),
            },
          },
        });

        // Log the backup code usage
        await prisma.userActivity.create({
          data: {
            userId: user.id,
            type: '2FA_BACKUP_CODE_USED',
            ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
            userAgent: req.headers.get('user-agent') || 'unknown',
          },
        });

        return NextResponse.json({ success: true });
      }

      // Verify TOTP
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: 'base32',
        token: token,
        window: 1,
      });

      if (!verified) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 400 }
        );
      }

      // Log successful 2FA verification
      await prisma.userActivity.create({
        data: {
          userId: user.id,
          type: '2FA_VERIFICATION_SUCCESS',
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
          userAgent: req.headers.get('user-agent') || 'unknown',
        },
      });
      // Generate tokens with role
      const { accessToken, refreshToken } = generateTokens(user.id, user.role);

      // Determine redirect URL based on role
      const redirectUrl = user.role === 'ADMIN' ? '/adminpanel' : '/dashboard';

      const response = NextResponse.json({ success: true, redirectUrl });

      // Set cookies with proper flags
      response.cookies.set('token', accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 15 * 60, // 15 minutes
          path: '/',
      });

      response.cookies.set('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: '/',
      });

        return response;
  } catch (error) {
    console.error('2FA validation error:', error);

    if (error instanceof PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: 'Database error occurred' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
