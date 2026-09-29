import { NextRequest, NextResponse } from "next/server";
import { getUserInfoFromToken } from "@/lib/helpers/getUserInfoFromToken";
import { beginTwoFactorSetup } from "@/lib/auth/twoFactorEnrollment";

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

    return NextResponse.json(await beginTwoFactorSetup(userId));
  } catch (error) {
    console.error("2FA setup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
