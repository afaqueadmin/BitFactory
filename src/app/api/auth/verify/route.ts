import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json({ isValid: false, error: 'No token provided' }, { status: 401 });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { userId: string; role: string };
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