import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

interface PaymentDetailsPayload {
  companyName?: string;
  companyLegalName?: string;
  companyLocation?: string;
  machineHostingLocation?: string;
  logoBase64?: string | null;
  paymentOption1Title?: string;
  paymentOption1Details?: string;
  paymentOption2Title?: string;
  paymentOption2Details?: string;
  paymentOption3Title?: string;
  paymentOption3Details?: string;
  billingInquiriesEmail?: string;
  billingInquiriesWhatsApp?: string;
  supportEmail?: string;
  supportWhatsApp?: string;
}

// GET /api/admin/payment-details - Fetch current payment details
export async function GET(request: NextRequest) {
  try {
    // Verify admin authorization
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: No token provided" },
        { status: 401 },
      );
    }

    try {
      const decoded = await verifyJwtToken(token);

      // Only ADMIN and SUPER_ADMIN can access
      if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Forbidden: Admin access required" },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 },
      );
    }

    // Fetch payment details
    let paymentDetails = await prisma.paymentDetails.findFirst();

    // If no payment details exist, create default ones
    if (!paymentDetails) {
      paymentDetails = await prisma.paymentDetails.create({
        data: {
          companyName: "BitFactory.AE",
          companyLegalName: "Higgs Computing Limited",
          companyLocation: "Ras Al Khaimah, UAE",
          machineHostingLocation: "Addis Ababa, Ethiopia",
          paymentOption1Title: "OPTION 1:",
          paymentOption1Details:
            "USDT (Tron): TLNjcYnokhA1UcVsYVKjdeh9HzMS6GQJNe",
          paymentOption2Title: "OPTION 2:",
          paymentOption2Details:
            "USDC (ETH): 0x722460E434013075E8cF8dd42c8854424aFa336E",
          paymentOption3Title: "OPTION 3:",
          paymentOption3Details: "",
          billingInquiriesEmail: "invoices@bitfactory.ae",
          billingInquiriesWhatsApp: "+971-52-6062903",
          supportEmail: "support@bitfactory.ae",
          supportWhatsApp: "+971-52-6062903",
        },
      });
    }

    // Fetch updated user info if updatedBy is set
    let updatedByUser = null;
    if (paymentDetails.updatedBy) {
      updatedByUser = await prisma.user.findUnique({
        where: { id: paymentDetails.updatedBy },
        select: { id: true, name: true, email: true },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...paymentDetails,
        updatedByUser,
      },
    });
  } catch (error) {
    console.error("Error fetching payment details:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment details" },
      { status: 500 },
    );
  }
}

// PUT /api/admin/payment-details - Update payment details
export async function PUT(req: NextRequest) {
  try {
    // Verify admin authorization
    const token = req.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: No token provided" },
        { status: 401 },
      );
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);

      // Only ADMIN and SUPER_ADMIN can update
      if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Forbidden: Admin access required" },
          { status: 403 },
        );
      }

      userId = decoded.userId;
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 },
      );
    }

    const body: PaymentDetailsPayload = await req.json();

    // Validate that at least one field is being updated
    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    // Get existing payment details
    let existingDetails = await prisma.paymentDetails.findFirst();

    if (!existingDetails) {
      // Create if doesn't exist
      existingDetails = await prisma.paymentDetails.create({
        data: {
          companyName: body.companyName || "BitFactory.AE",
          companyLegalName: body.companyLegalName || "Higgs Computing Limited",
          companyLocation: body.companyLocation || "Ras Al Khaimah, UAE",
          machineHostingLocation:
            body.machineHostingLocation || "Addis Ababa, Ethiopia",
          paymentOption1Title: body.paymentOption1Title || "OPTION 1:",
          paymentOption1Details:
            body.paymentOption1Details ||
            "USDT (Tron): TLNjcYnokhA1UcVsYVKjdeh9HzMS6GQJNe",
          paymentOption2Title: body.paymentOption2Title || "OPTION 2:",
          paymentOption2Details:
            body.paymentOption2Details ||
            "USDC (ETH): 0x722460E434013075E8cF8dd42c8854424aFa336E",
          paymentOption3Title: body.paymentOption3Title || "OPTION 3:",
          paymentOption3Details: body.paymentOption3Details || "",
          billingInquiriesEmail:
            body.billingInquiriesEmail || "invoices@bitfactory.ae",
          billingInquiriesWhatsApp:
            body.billingInquiriesWhatsApp || "+971-52-6062903",
          supportEmail: body.supportEmail || "support@bitfactory.ae",
          supportWhatsApp: body.supportWhatsApp || "+971-52-6062903",
          updatedBy: userId,
        },
      });
    } else {
      // Update existing
      existingDetails = await prisma.paymentDetails.update({
        where: { id: existingDetails.id },
        data: {
          ...(body.companyName !== undefined && {
            companyName: body.companyName,
          }),
          ...(body.companyLegalName !== undefined && {
            companyLegalName: body.companyLegalName,
          }),
          ...(body.companyLocation !== undefined && {
            companyLocation: body.companyLocation,
          }),
          ...(body.machineHostingLocation !== undefined && {
            machineHostingLocation: body.machineHostingLocation,
          }),
          ...(body.logoBase64 !== undefined && { logoBase64: body.logoBase64 }),
          ...(body.paymentOption1Title !== undefined && {
            paymentOption1Title: body.paymentOption1Title,
          }),
          ...(body.paymentOption1Details !== undefined && {
            paymentOption1Details: body.paymentOption1Details,
          }),
          ...(body.paymentOption2Title !== undefined && {
            paymentOption2Title: body.paymentOption2Title,
          }),
          ...(body.paymentOption2Details !== undefined && {
            paymentOption2Details: body.paymentOption2Details,
          }),
          ...(body.paymentOption3Title !== undefined && {
            paymentOption3Title: body.paymentOption3Title,
          }),
          ...(body.paymentOption3Details !== undefined && {
            paymentOption3Details: body.paymentOption3Details,
          }),
          ...(body.billingInquiriesEmail !== undefined && {
            billingInquiriesEmail: body.billingInquiriesEmail,
          }),
          ...(body.billingInquiriesWhatsApp !== undefined && {
            billingInquiriesWhatsApp: body.billingInquiriesWhatsApp,
          }),
          ...(body.supportEmail !== undefined && {
            supportEmail: body.supportEmail,
          }),
          ...(body.supportWhatsApp !== undefined && {
            supportWhatsApp: body.supportWhatsApp,
          }),
          updatedBy: userId,
        },
      });
    }

    // Fetch updated user info
    const updatedByUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({
      success: true,
      message: "Payment details updated successfully",
      data: {
        ...existingDetails,
        updatedByUser,
      },
    });
  } catch (error) {
    console.error("Error updating payment details:", error);
    return NextResponse.json(
      { error: "Failed to update payment details" },
      { status: 500 },
    );
  }
}
