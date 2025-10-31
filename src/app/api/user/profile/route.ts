import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {getUserInfoFromToken} from "@/lib/helpers/getUserInfoFromToken";

// Enable request logging middleware
export const middleware = async (request: NextRequest) => {
  console.log(`${request.method} ${request.url} - Request received`);
  return NextResponse.next();
};

// GET: Fetch user profile
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = getUserInfoFromToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        phoneNumber: true,
        dateOfBirth: true,
        country: true,
        city: true,
        streetAddress: true,
        profileImage: true,
        profileImageId: true,
        companyName: true,
        vatNumber: true,
        role: true,
        twoFactorEnabled: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch recent activities
    const recentActivities = await prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({ user, recentActivities });
  } catch (error) {
    console.error('Error fetching user profile:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// PATCH: Update user profile
export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = getUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const data = await request.json();
    
    // Validate required fields
    if (!data.email?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Check if email is being changed and if it's already taken
    if (data.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: data.email,
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 400 });
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        email: data.email,
        name: data.name,
        phoneNumber: data.phoneNumber,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        country: data.country,
        city: data.city,
        streetAddress: data.streetAddress,
        companyName: data.companyName,
        vatNumber: data.vatNumber,
        profileImage: data.profileImage,
        profileImageId: data.profileImageId,
      },
      select: {
        email: true,
        name: true,
        phoneNumber: true,
        dateOfBirth: true,
        country: true,
        city: true,
        streetAddress: true,
        profileImage: true,
        profileImageId: true,
        companyName: true,
        vatNumber: true,
        role: true,
      },
    });

    // Log the profile update activity
    await prisma.userActivity.create({
      data: {
        userId,
        type: 'PROFILE_UPDATE',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}