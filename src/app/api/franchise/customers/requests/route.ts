/**
 * /api/franchise/customers/requests
 *
 * Franchisees cannot create customers directly — they submit a request here,
 * which an admin must approve (POST /api/admin/customer-requests/[id]/approve)
 * before the actual User account is created and shows up in
 * GET /api/franchise/customers.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { getOwnFranchise } from "@/lib/franchiseeScope";
import normalizeEmailUsername from "@/lib/helpers/normailizeEmailUsername";

async function requireFranchisee(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };

  let decoded;
  try {
    decoded = await verifyJwtToken(token);
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }

  if (decoded.role !== "FRANCHISEE") {
    return { error: "Franchisee access required", status: 403 as const };
  }

  return { decoded };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireFranchisee(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const requests = await prisma.franchiseCustomerRequest.findMany({
      where: { requestedById: auth.decoded.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        luxorSubaccountName: true,
        initialDeposit: true,
        status: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: requests });
  } catch (error) {
    console.error("[Franchise Customer Requests API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch requests" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireFranchisee(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const body = await request.json();
    const { name, email, phoneNumber, initialDeposit } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 },
      );
    }
    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 },
      );
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 },
      );
    }
    if (
      phoneNumber !== undefined &&
      phoneNumber !== null &&
      typeof phoneNumber !== "string"
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid phone number" },
        { status: 400 },
      );
    }
    if (
      initialDeposit !== undefined &&
      initialDeposit !== null &&
      initialDeposit !== "" &&
      (typeof initialDeposit !== "number" || initialDeposit < 0)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Initial deposit must be a non-negative number",
        },
        { status: 400 },
      );
    }

    const franchise = await getOwnFranchise(auth.decoded.userId);
    if (!franchise) {
      return NextResponse.json(
        { success: false, error: "No franchise record found for this account" },
        { status: 400 },
      );
    }

    // Email uniqueness — same normalized-username comparison used elsewhere
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true },
    });
    const normalizedUsername = normalizeEmailUsername(email);
    if (
      allUsers.some(
        (u) => normalizeEmailUsername(u.email) === normalizedUsername,
      )
    ) {
      return NextResponse.json(
        { success: false, error: "Email is already in use" },
        { status: 400 },
      );
    }

    const created = await prisma.franchiseCustomerRequest.create({
      data: {
        franchiseId: franchise.id,
        requestedById: auth.decoded.userId,
        name: name.trim(),
        email: email.trim(),
        phoneNumber:
          typeof phoneNumber === "string" && phoneNumber.trim()
            ? phoneNumber.trim()
            : null,
        initialDeposit:
          initialDeposit !== undefined &&
          initialDeposit !== null &&
          initialDeposit !== ""
            ? initialDeposit
            : null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: "Request submitted — pending admin approval",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Franchise Customer Requests API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit request" },
      { status: 500 },
    );
  }
}
