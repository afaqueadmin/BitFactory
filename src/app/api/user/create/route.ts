import { prisma } from "@/lib/prisma";
import { hash } from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { sendWelcomeEmail } from "@/lib/email";
import normalizeEmailUsername from "@/lib/helpers/normailizeEmailUsername";

/**
 * Response structure from /api/luxor proxy route
 */
interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    console.log("Create user API [POST]: Token present:", !!token);

    if (!token) {
      return Response.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    let userId: string;
    // Check if the current user is an admin
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      console.log("CreateUser API [POST]: Token verified, userId:", userId);
    } catch (error) {
      console.error("CreateUser API [POST]: Token verification failed:", error);
      return Response.json(
        { error: "Invalid token" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can create users" },
        { status: 403 },
      );
    }

    const {
      name,
      email,
      role,
      sendEmail,
      initialDeposit,
      luxorSubaccountName,
      groupId,
    } = await request.json();

    // Validate input
    if (!name || !email || !role) {
      return NextResponse.json(
        { error: "Name, email, and role are required" },
        { status: 400 },
      );
    }

    // Validate luxorSubaccountName only for CLIENT role (V2 API: no groups, direct subaccount)
    if (role === "CLIENT") {
      if (!luxorSubaccountName || luxorSubaccountName.trim().length === 0) {
        return NextResponse.json(
          { error: "A Luxor subaccount must be selected for CLIENT users" },
          { status: 400 },
        );
      }
    }

    console.log(
      `[User Create API] Creating user "${name}" with role: ${role}${
        role === "CLIENT" ? `, subaccount: ${luxorSubaccountName}` : ""
      }`,
    );

    // Check if email is already in use
    // Find all users and match by normalizing their stored email usernames
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true },
    });

    // Find user by comparing normalized email usernames
    const normalizedUsername = normalizeEmailUsername(email);
    const existingUser = allUsers.find(
      (u) => normalizeEmailUsername(u.email) === normalizedUsername,
    );

    if (existingUser) {
      return NextResponse.json(
        { error: "Email is already in use" },
        { status: 400 },
      );
    }

    // Generate a random temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await hash(tempPassword, 12);

    // Create the user in database
    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role,
        },
      });
      console.log(`[User Create API] User created in DB: ${newUser.id}`);
    } catch (dbError) {
      console.error("[User Create API] Failed to create user in DB:", dbError);
      throw new Error("Failed to create user in database");
    }

    // If client role and initial deposit provided, create cost payment entry
    if (role === "CLIENT" && initialDeposit && initialDeposit > 0) {
      try {
        await prisma.costPayment.create({
          data: {
            userId: newUser.id,
            amount: initialDeposit,
            consumption: 0,
            type: "PAYMENT",
          },
        });
        console.log(
          `[User Create API] Created initial cost payment: ${initialDeposit} for user ${newUser.id}`,
        );
      } catch (paymentError) {
        console.error(
          "[User Create API] Failed to create cost payment:",
          paymentError,
        );
        // Don't fail user creation if payment entry creation fails
      }
    }

    // For CLIENT role, assign the selected Luxor subaccount
    // (subaccount already exists in Luxor, we're just assigning it to this user)
    if (role === "CLIENT" && luxorSubaccountName) {
      try {
        await prisma.user.update({
          where: { id: newUser.id },
          data: { luxorSubaccountName: luxorSubaccountName.trim() },
        });
        console.log(
          `[User Create API] Assigned luxorSubaccountName "${luxorSubaccountName}" to user ${newUser.id}`,
        );
      } catch (updateError) {
        console.error(
          "[User Create API] Failed to update user with subaccount name:",
          updateError,
        );
        // Don't fail user creation if this update fails
      }
    }

    // If groupId provided, create GroupSubaccount entry to link subaccount to group
    if (role === "CLIENT" && groupId && luxorSubaccountName) {
      try {
        await prisma.groupSubaccount.create({
          data: {
            groupId: groupId,
            subaccountName: luxorSubaccountName.trim(),
            addedBy: userId, // Admin who added the user
          },
        });
        console.log(
          `[User Create API] Added subaccount "${luxorSubaccountName}" to group "${groupId}" for user ${newUser.id}`,
        );
      } catch (groupError) {
        console.error(
          "[User Create API] Failed to add subaccount to group:",
          groupError,
        );
        // Don't fail user creation if group assignment fails
      }
    }

    // Log the user creation activity
    await prisma.userActivity.create({
      data: {
        userId,
        type: "USER_CREATED",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    const sendEmailByEnvironment = process.env.NODE_ENV === "production";
    let emailSent = sendEmailByEnvironment;
    if (sendEmailByEnvironment && sendEmail) {
      // Send welcome email with credentials
      const emailResult = await sendWelcomeEmail(email, tempPassword);
      if (!emailResult.success) {
        console.error("Failed to send welcome email:", emailResult.error);
        emailSent = false;
      }
    }

    return NextResponse.json(
      {
        message: "User created successfully",
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          luxorSubaccountName: role === "CLIENT" ? luxorSubaccountName : null,
        },
        tempPassword, //@TODO: In production, this should be sent via email instead
        emailSent,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "An error occurred while creating the user" },
      { status: 500 },
    );
  }
}
