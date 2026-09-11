import { NextRequest, NextResponse } from "next/server";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getUserInfoFromToken } from "@/lib/helpers/getUserInfoFromToken";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = getUserInfoFromToken(token);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    // Generate a secret
    const secret = speakeasy.generateSecret({
      name: `BitFactory: ${user?.email}`,
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Save the secret. Row may not exist yet for a user's first-ever setup -
    // upsert covers both that and a re-run (e.g. scanning a fresh QR code).
    await prisma.twoFactorAuth.upsert({
      where: { userId },
      create: {
        userId,
        secret: secret.base32,
        enabled: false, // Will be enabled after verification
      },
      update: {
        secret: secret.base32,
        enabled: false,
      },
    });

    return NextResponse.json({
      secret: secret.base32,
      qrCode: qrCodeUrl,
    });
  } catch (error) {
    console.error("2FA setup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
