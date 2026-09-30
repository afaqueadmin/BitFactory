import { NextRequest, NextResponse } from "next/server";
import { generatePasskeySignInOptions } from "@/lib/webauthn/server";
import { enforceAuthRateLimit, getClientIp } from "@/lib/rateLimit";
import { signAuthenticationChallenge } from "@/lib/jwt";

export const runtime = "nodejs";

function getWebAuthnConfig(request: NextRequest): {
  origin: string;
  rpId: string;
} {
  return {
    origin: request.nextUrl.origin,
    rpId: request.nextUrl.hostname,
  };
}

/**
 * POST /api/auth/webauthn/authenticate/options
 * Get authentication options for passkey login
 * Email required, no auth needed (public endpoint)
 *
 * N-4: every email gets the same kind of reply - options with a credential
 * list and a challenge cookie - whether or not it has an account (deleted
 * ones included, N-3) or any passkeys. See generatePasskeySignInOptions.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // N-1: public and answers per email, so cap how fast it can be probed.
    // Looser than login: every passkey sign-in attempt starts here.
    const limited = await enforceAuthRateLimit(
      "webauthn_options",
      { email, ip: getClientIp(request.headers) },
      {
        perEmail: { max: 20, windowSeconds: 15 * 60 },
        perIp: { max: 60, windowSeconds: 15 * 60 },
      },
    );
    if (limited) return limited;

    const { options, bindTo } = await generatePasskeySignInOptions(
      email,
      getWebAuthnConfig(request),
    );

    const response = NextResponse.json(options, { status: 200 });

    // N-5: the cookie holds the challenge signed and bound to the account
    // (or decoy), not the raw challenge - a raw value is whatever the browser
    // sends back, so a captured sign-in could be replayed by setting it.
    const boundChallenge = await signAuthenticationChallenge(
      bindTo,
      options.challenge,
    );
    response.cookies.set("webauthn_auth_challenge", boundChallenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 5 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("WebAuthn authentication options error:", error);
    return NextResponse.json(
      { error: "Failed to generate authentication options" },
      { status: 500 },
    );
  }
}
