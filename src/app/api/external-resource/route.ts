import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, [
      "external_resources.view",
      "miners.view",
    ]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const resource = await prisma.externalResource.findUnique({
      where: { key },
    });

    return NextResponse.json({ resource }, { status: 200 });
  } catch (error) {
    console.error("ExternalResource API [GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["external_resources.edit"]);
    if ("response" in auth) return auth.response;

    const body = await request.json();
    const { key, url, label } = body;

    if (!key || !url) {
      return NextResponse.json(
        { error: "Key and URL are required" },
        { status: 400 },
      );
    }

    const resource = await prisma.externalResource.upsert({
      where: { key },
      update: { url, label },
      create: { key, url, label },
    });

    return NextResponse.json({ resource }, { status: 200 });
  } catch (error) {
    console.error("ExternalResource API [POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
