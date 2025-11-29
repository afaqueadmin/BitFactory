import { prisma } from "@/lib/prisma";
import { hash } from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { sendWelcomeEmail } from "@/lib/email";

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

    if (user && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can create new users" },
        { status: 403 },
      );
    }

    const { name, email, role, sendEmail, groupIds, initialDeposit } =
      await request.json();

    // Validate input
    if (!name || !email || !role) {
      return NextResponse.json(
        { error: "Name, email, and role are required" },
        { status: 400 },
      );
    }

    // Validate groupIds - must be provided and be a non-empty array
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return NextResponse.json(
        { error: "At least one group must be selected" },
        { status: 400 },
      );
    }

    console.log(
      `[User Create API] Creating user "${name}" with groupIds:`,
      groupIds,
    );

    // Check if email is already in use
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { role: true },
    });

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
    // Mirrors the exact flow from the Subaccounts page:
    // 1. Admin selects one or more groups from /api/luxor?endpoint=workspace
    // 2. For each selected group, call POST /api/luxor with:
    //    - endpoint: "subaccount"
    //    - groupId: <selected-group-id>
    //    - name: <subaccount-name> (uses the user's name)
    // 3. Handle errors gracefully per group (don't stop if one fails)
    // 4. Return summary of successes/failures
    const luxorCreationResults: {
      groupId: string;
      success: boolean;
      error?: string;
    }[] = [];

    for (const groupId of groupIds) {
      try {
        console.log(
          `[User Create API] Creating Luxor subaccount "${name}" in group: ${groupId}`,
        );

        // Validate groupId format (should be UUID-like)
        if (
          !groupId ||
          typeof groupId !== "string" ||
          groupId.trim().length === 0
        ) {
          console.error(
            `[User Create API] Invalid groupId format: ${JSON.stringify(groupId)}`,
          );
          luxorCreationResults.push({
            groupId: String(groupId),
            success: false,
            error: "Invalid group ID format",
          });
          continue;
        }

        // Use the same API endpoint as the Subaccounts page:
        // POST /api/luxor with endpoint: "subaccount"
        const luxorResponse = await fetch(
          `${request.nextUrl.origin}/api/luxor`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Forward the admin's auth token to the Luxor proxy
              Cookie: request.headers.get("cookie") || "",
            },
            body: JSON.stringify({
              endpoint: "subaccount",
              groupId,
              name,
            }),
          },
        );

        const luxorData: ProxyResponse = await luxorResponse.json();

        console.log(
          `[User Create API] Luxor API response for group ${groupId}:`,
          {
            status: luxorResponse.status,
            success: luxorData.success,
            error: luxorData.error,
          },
        );

        if (!luxorResponse.ok || !luxorData.success) {
          const errorMsg =
            luxorData.error || `API returned status ${luxorResponse.status}`;
          console.warn(
            `[User Create API] Failed to create subaccount in group ${groupId}: ${errorMsg}`,
          );
          luxorCreationResults.push({
            groupId,
            success: false,
            error: errorMsg,
          });
        } else {
          console.log(
            `[User Create API] Subaccount created successfully in group ${groupId}`,
          );
          luxorCreationResults.push({
            groupId,
            success: true,
          });
        }
      } catch (groupError) {
        const errorMsg =
          groupError instanceof Error
            ? groupError.message
            : "Unknown error occurred";
        console.error(
          `[User Create API] Exception creating subaccount in group ${groupId}:`,
          errorMsg,
        );
        luxorCreationResults.push({
          groupId,
          success: false,
          error: errorMsg,
        });
      }
    }

    // Check if any subaccount creation succeeded
    const successCount = luxorCreationResults.filter((r) => r.success).length;
    const failureCount = luxorCreationResults.filter((r) => !r.success).length;

    // Log creation summary
    if (failureCount > 0) {
      console.warn(
        `[User Create API] Subaccount creation summary: ${successCount} succeeded, ${failureCount} failed`,
        luxorCreationResults,
      );
    } else {
      console.log(
        `[User Create API] All subaccounts created successfully in ${successCount} group(s)`,
      );
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

    if (process.env.NODE_ENV === "production" && sendEmail) {
      // Send welcome email with credentials
      const emailResult = await sendWelcomeEmail(email, tempPassword);
      if (!emailResult.success) {
        console.error("Failed to send welcome email:", emailResult.error);
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
        },
        tempPassword, //@TODO: In production, this should be sent via email instead
        luxorCreationResults,
        luxorSummary: {
          successCount,
          failureCount,
          totalAttempted: groupIds.length,
          note:
            failureCount > 0
              ? "Some Luxor subaccounts failed to create. Check group configuration and group IDs."
              : "All Luxor subaccounts created successfully",
        },
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
