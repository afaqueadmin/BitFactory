import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that don't require authentication
const publicPaths = new Set([
  '/',
  '/login',
  '/api/login',
  '/api/auth/check',
  '/api/auth/signout',
  '/api/auth/refresh',
  '/BitfactoryLogo.webp',
  '/file.svg',
  '/globe.svg',
  '/logo.webp',
  '/next.svg',
  '/vercel.svg',
  '/window.svg'
]);

// Protected paths that require authentication
const protectedPaths = new Set([
  '/dashboard',
  '/profile',
  '/settings',
  '/miners',
  '/wallet',
  '/account-settings',
  '/api/user/profile'
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the path is public
  if (publicPaths.has(pathname)) {
    // If user is logged in and tries to access login page, redirect to dashboard
    if (pathname === '/login') {
      const token = request.cookies.get('token')?.value;
      if (token) {
        try {
          const authCheck = await fetch(new URL('/api/auth/check', request.url), {
            headers: { cookie: request.headers.get('cookie') || '' }
          });
          if (authCheck.ok) {
            return NextResponse.redirect(new URL('/dashboard', request.url));
          }
        } catch (error) {
          console.error('Auth check error:', error);
        }
      }
    }
    return NextResponse.next();
  }

  try {
    const token = request.cookies.get('token')?.value;
    const refreshToken = request.cookies.get('refresh_token')?.value;

    // No tokens present, redirect to login
    if (!token && !refreshToken) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Unauthorized', code: 'NO_TOKEN' },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Verify token validity
    const authCheck = await fetch(new URL('/api/auth/check', request.url), {
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
    });

    const authResult = await authCheck.json();

    if (!authCheck.ok || !authResult.isAuthenticated) {
      // Clear invalid cookies
      const response = pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url));

      // Clear cookies on authentication failure or logout
      const cookieNames = ['token', 'refresh_token'] as const;
      cookieNames.forEach((cookieName: typeof cookieNames[number]) => {
        response.cookies.set(cookieName, '', {
          maxAge: 0,
          path: '/',
          secure: process.env.NODE_ENV === 'production',
          httpOnly: true,
          sameSite: 'strict',
          expires: new Date(0)
        });
      });

      return response;
    }

    // For authenticated users, ensure they can't access public auth pages
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

// Configure which routes require the middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};