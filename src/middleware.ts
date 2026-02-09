import { NextResponse, URLPattern } from "next/server";
import type { NextRequest } from "next/server";
import { JwtPayload, verifyJwtToken } from "@/lib/jwt";

// Publicly accessible paths (no authentication required)
const publicPaths = new Set([
  "/",
  "/login",
  "/api/auth/2fa/validate", // Adding 2FA validation endpoint
  "/BitfactoryLogo.webp",
  "/file.svg",
  "/globe.svg",
  "/logo.webp",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
  "/favicon.svg",
]);

const securePaths = {
  CLIENT: new Set<string>([
    "/account-settings",
    "/btc-price-history",
    "/clientworkers",
    "/dashboard",
    "/hashprice-history",
    "/invoices",
    "/luxor",
    "/miners",
    "/payback-analysis",
    "/security-setting",
    "/wallet",
    // Add client-specific public paths if any
  ]),
  ADMIN: new Set<string>([
    "/admin-profile",
    "/adminpanel",
    "/accounting",
    "/customers/overview",
    "/groups",
    "/hardware",
    "/machine",
    "/security-settings",
    "/settings/payment",
    "/space",
    "/subaccounts",
    "/workers",
    // Add admin-specific public paths if any
  ]),
}; // Add admin-specific public paths if any

const dynamicPatternsPaths = {
  CLIENT: [],
  ADMIN: [
    new URLPattern({ pathname: "/accounting/:path*" }),
    new URLPattern({ pathname: "/customers/:id*" }),
    new URLPattern({ pathname: "/groups/:id*" }),
  ],
};

// Role-based default redirects
const getDefaultPathForRole = (role: string) => {
  switch (role) {
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/adminpanel";
    case "CLIENT":
      return "/dashboard";
    default:
      return "/login";
  }
};

// Check if a path is inside a route group folder like (auth) or (manage)
const isInRouteGroup = (pathname: string, role: "CLIENT" | "ADMIN") => {
  return (
    securePaths[role].has(pathname) ||
    dynamicPatternsPaths[role].some((p) => p.test({ pathname }))
  );
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ✅ Skip all API routes entirely (no JSON parse errors)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // ✅ Allow public assets and login page
  if (publicPaths.has(pathname)) {
    // Prevent logged-in users from visiting /login again
    if (pathname === "/login") {
      const token = request.cookies.get("token")?.value;
      if (token) {
        try {
          const decoded = await verifyJwtToken(token);
          const redirectPath = getDefaultPathForRole(decoded.role);
          return NextResponse.redirect(new URL(redirectPath, request.url));
        } catch (error) {
          console.error("Token verification failed at /login:", error);
        }
      }
    }
    return NextResponse.next();
  }

  try {
    const token = request.cookies.get("token")?.value;
    const refreshToken = request.cookies.get("refresh_token")?.value;

    // No token = unauthenticated user
    if (!token && !refreshToken) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Decode JWT
    let decoded: JwtPayload | null = null;
    if (token) {
      try {
        decoded = await verifyJwtToken(token);
        console.log("✅ Token verified:", decoded);
      } catch (err) {
        console.error("❌ Invalid JWT token:", err);
      }
    }

    // If decoding failed → redirect to login
    if (!decoded) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.set("token", "", { maxAge: 0, path: "/" });
      response.cookies.set("refresh_token", "", { maxAge: 0, path: "/" });
      return response;
    }

    // ✅ Role-based access control
    const userRole = decoded.role;

    if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
      const role = "ADMIN"; // Don't distinguish between ADMIN and SUPER_ADMIN for route access
      // Prevent admin/super_admin from accessing client routes
      if (!isInRouteGroup(pathname, role)) {
        return NextResponse.redirect(new URL("/adminpanel", request.url));
      }
    }

    if (userRole === "CLIENT") {
      // Prevent client from accessing admin routes
      if (!isInRouteGroup(pathname, userRole)) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    // ✅ Allow everything else (user is valid)
    return NextResponse.next();
  } catch (error) {
    console.error("Middleware auth error:", error);
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

// ✅ Apply middleware to all routes except static files
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/2fa/validate).*)",
  ],
};
