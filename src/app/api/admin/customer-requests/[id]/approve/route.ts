/**
 * POST /api/admin/customer-requests/[id]/approve
 *
 * Approves a pending franchisee customer request: creates the actual CLIENT
 * user (RETAIL segment, attached to the requesting franchise), links it back
 * to the request, and marks the request APPROVED. ADMIN/SUPER_ADMIN only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcrypt";
import { verifyJwtToken } from "@/lib/jwt";
import { sendWelcomeEmail } from "@/lib/email";
import normalizeEmailUsername from "@/lib/helpers/normailizeEmailUsername";
import { getOrCreatePaybackConfig } from "@/lib/paybackConfigHelpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 },
      );
    }

    const customerRequest = await prisma.franchiseCustomerRequest.findUnique({
      where: { id },
      include: {
        franchise: { select: { id: true, isActive: true, deletedAt: true } },
      },
    });

    if (!customerRequest) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }

    if (customerRequest.status !== "PENDING") {
      return NextResponse.json(
        {
          success: false,
          error: `Request has already been ${customerRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    if (
      !customerRequest.franchise.isActive ||
      customerRequest.franchise.deletedAt
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "The requesting franchise is no longer active",
        },
        { status: 400 },
      );
    }

    // Admin may edit details (and must supply a subaccount) from the review
    // form before creating the user — fall back to the submitted values.
    const body = await request.json().catch(() => ({}));

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : customerRequest.name;

    const email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : customerRequest.email;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 },
      );
    }

    const phoneNumber =
      body.phoneNumber !== undefined
        ? typeof body.phoneNumber === "string" && body.phoneNumber.trim()
          ? body.phoneNumber.trim()
          : null
        : customerRequest.phoneNumber;

    const initialDeposit =
      body.initialDeposit !== undefined
        ? body.initialDeposit !== null &&
          body.initialDeposit !== "" &&
          typeof body.initialDeposit === "number" &&
          body.initialDeposit >= 0
          ? body.initialDeposit
          : null
        : customerRequest.initialDeposit;

    const luxorSubaccountName =
      typeof body.luxorSubaccountName === "string" &&
      body.luxorSubaccountName.trim()
        ? body.luxorSubaccountName.trim()
        : customerRequest.luxorSubaccountName;

    if (!luxorSubaccountName) {
      return NextResponse.json(
        { success: false, error: "A Luxor subaccount must be selected" },
        { status: 400 },
      );
    }

    // Re-validate uniqueness at approval time (time may have passed since submission)
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

    const existingSubaccount = await prisma.user.findFirst({
      where: { luxorSubaccountName },
      select: { id: true },
    });
    if (existingSubaccount) {
      return NextResponse.json(
        {
          success: false,
          error: "This Luxor subaccount is already assigned",
        },
        { status: 400 },
      );
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await hash(tempPassword, 12);
    const { defaultInvoicedAmount } = await getOrCreatePaybackConfig("CLIENT");

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          phoneNumber,
          password: hashedPassword,
          role: "CLIENT",
          segment: "RETAIL",
          franchiseeId: customerRequest.franchiseId,
          luxorSubaccountName,
          invoicedAmount: defaultInvoicedAmount,
        },
      });

      if (initialDeposit && Number(initialDeposit) > 0) {
        await tx.costPayment.create({
          data: {
            userId: user.id,
            amount: Number(initialDeposit),
            consumption: 0,
            type: "PAYMENT",
          },
        });
      }

      await tx.franchiseCustomerRequest.update({
        where: { id },
        data: {
          name,
          email,
          phoneNumber,
          initialDeposit,
          luxorSubaccountName,
          status: "APPROVED",
          reviewedById: decoded.userId,
          reviewedAt: new Date(),
          createdUserId: user.id,
        },
      });

      return user;
    });

    let emailSent = false;
    if (process.env.NODE_ENV === "production") {
      const emailResult = await sendWelcomeEmail(newUser.email, tempPassword);
      emailSent = emailResult.success;
      if (!emailResult.success) {
        console.error(
          "[Admin Customer Requests API] Failed to send welcome email:",
          emailResult.error,
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Request approved and customer created",
      data: {
        user: { id: newUser.id, name: newUser.name, email: newUser.email },
        tempPassword,
        emailSent,
      },
    });
  } catch (error) {
    console.error("[Admin Customer Requests API] approve error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to approve request" },
      { status: 500 },
    );
  }
}
