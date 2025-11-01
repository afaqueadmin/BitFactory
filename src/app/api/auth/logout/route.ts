import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    // Clear the JWT token cookie
    const cookieStore = await cookies();
    cookieStore.delete("token");

    return NextResponse.json(
      { message: "Logged out successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }
}
