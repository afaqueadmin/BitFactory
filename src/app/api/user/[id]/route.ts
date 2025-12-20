import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can update users" },
        { status: 403 },
      );
    }

    const body = await request.json();

    // Update user with provided fields
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        phoneNumber: body.phoneNumber,
        companyName: body.companyName,
        streetAddress: body.streetAddress,
        city: body.city,
        country: body.country,
        companyUrl: body.companyUrl,
        email:
          user.role === "SUPER_ADMIN" && body.email ? body.email : undefined,
        luxorSubaccountName:
          body.luxorSubaccountName !== undefined
            ? body.luxorSubaccountName
            : undefined,
      },
    });

    return NextResponse.json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can delete users" },
        { status: 403 },
      );
    }

    // Prevent admin from deleting themselves
    if (id === userId) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 },
      );
    }

    // Check if user has any miners linked
    const minerCount = await prisma.miner.count({
      where: { userId: id },
    });

    if (minerCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete user with ${minerCount} linked miner(s). Please remove all miners first.`,
        },
        { status: 400 },
      );
    }

    // Delete user and related data
    // First, delete user activities
    await prisma.userActivity.deleteMany({
      where: { userId: id },
    });

    // Delete token blacklist entries
    await prisma.tokenBlacklist.deleteMany({
      where: { userId: id },
    });

    // Delete miners associated with the user
    await prisma.miner.deleteMany({
      where: { userId: id },
    });

    // Delete cost payments associated with the user
    await prisma.costPayment.deleteMany({
      where: { userId: id },
    });

    // Finally, delete the user
    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: `Failed to delete user: ${error}` },
      { status: 500 },
    );
  }
}
