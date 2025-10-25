import { NextRequest, NextResponse } from 'next/server';
import { verifyJwtToken } from '@/lib/jwt';

// Add runtime config for Node.js runtime
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json({ isValid: false, error: 'No token provided' }, { status: 401 });
    }

    try {
      const decoded = await verifyJwtToken(token);
      return NextResponse.json({ 
        isValid: true, 
        userId: decoded.userId,
        role: decoded.role 
      });
    } catch (error) {
      return NextResponse.json({ isValid: false, error: 'Invalid token' }, { status: 401 });
    }
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json({ isValid: false, error: 'Internal server error' }, { status: 500 });
  }
}