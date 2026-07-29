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

// CLIENT paths, extracted so FRANCHISEE (who can also act as a client for
// their own personal mining operation, in addition to managing their
// onboarded customers) can reuse the exact same set below.
const clientPaths = [
  "/account-settings",
  "/btc-price-history",
  "/btc-price-predictor",
  "/clientworkers",
  "/dashboard",
  "/hashprice-history",
  "/invoices",
  "/luxor",
  "/miners",
  "/payback-analysis",
  "/security-setting",
  "/transaction",
  "/wallet",
  // Add client-specific public paths if any
];
const clientDynamicPatterns = [new URLPattern({ pathname: "/invoices/:id*" })];

const securePaths = {
  CLIENT: new Set<string>(clientPaths),
  ADMIN: new Set<string>([
    "/admin-profile",
    "/adminpanel",
    "/admin/payback-analysis",
    "/admin/payback-analysis-settings",
    "/admin/payback-analysis-company",
    "/admin/payback-analysis-company-settings",
    "/admin/monthly-revenue",
    "/admin/customer-balance",
    "/accounting/credit-adjustments",

    "/external-resource",
    "/customers/overview",
    "/franchisees",
    "/groups",
    "/hardware",
    "/machine",
    "/security-settings",
    "/settings/payment",
    "/space",
    "/subaccounts",
    "/workers",
    "/braiins-workers",
    "/activity-log",
    // Add admin-specific public paths if any
  ]),
  // Franchisee: their own dashboard plus the customers/machine pages (not
  // the admin panel itself), scoped server-side to the franchisee's own
  // customers/miners — PLUS the full CLIENT page set, since a franchisee
  // can also act as a client for their own personal mining operation.
  FRANCHISEE: new Set<string>([
    "/franchisee-dashboard",
    "/customers/overview",
    "/machine",
    ...clientPaths,
  ]),
}; // Add admin-specific public paths if any

const dynamicPatternsPaths = {
  CLIENT: clientDynamicPatterns,
  ADMIN: [
    new URLPattern({ pathname: "/accounting/:path*" }),
    new URLPattern({ pathname: "/customers/:id*" }),
    new URLPattern({ pathname: "/groups/:id*" }),
  ],
  FRANCHISEE: [
    new URLPattern({ pathname: "/customers/:id*" }),
    ...clientDynamicPatterns,
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
    case "FRANCHISEE":
      return "/franchisee-dashboard";
    default:
      return "/login";
  }
};

// Check if a path is inside a route group folder like (auth) or (manage)
const isInRouteGroup = (
  pathname: string,
  role: "CLIENT" | "ADMIN" | "FRANCHISEE",
) => {
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
          if (decoded.exp && Date.now() <= decoded.exp * 1000) {
            const redirectPath = getDefaultPathForRole(decoded.role);
            return NextResponse.redirect(new URL(redirectPath, request.url));
          }
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

    if (userRole === "FRANCHISEE") {
      // Prevent franchisee from accessing routes outside their scoped set
      // (including /adminpanel itself, which franchisees should never see)
      if (!isInRouteGroup(pathname, userRole)) {
        return NextResponse.redirect(
          new URL("/franchisee-dashboard", request.url),
        );
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
