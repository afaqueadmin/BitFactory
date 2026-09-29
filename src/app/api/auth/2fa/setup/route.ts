import { NextRequest, NextResponse } from "next/server";
import { getUserInfoFromToken } from "@/lib/helpers/getUserInfoFromToken";
import { beginTwoFactorSetup } from "@/lib/auth/twoFactorEnrollment";
import { verifyStepUp } from "@/lib/auth/stepUp";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await getUserInfoFromToken(token);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // C-2: setting up (or replacing) the authenticator needs re-verification
    // - the current 2FA code if 2FA is on, else the password - so a stolen
    // session can't put 2FA on the attacker's phone.
    const { currentPassword, twoFactorToken } = await request
      .json()
      .catch(() => ({}));
    const stepUp = await verifyStepUp(
      userId,
      { currentPassword, twoFactorToken },
      "set up two-factor authentication",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    return NextResponse.json(await beginTwoFactorSetup(userId));
  } catch (error) {
    console.error("2FA setup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
