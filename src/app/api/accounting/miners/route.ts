import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { loadSuggestedHostingLineItems } from "@/lib/accounting/minerMonthlyHosting";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, [
      "invoicing.view",
      "invoicing.create",
      "invoicing.edit",
    ]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing required parameter: customerId" },
        { status: 400 },
      );
    }

    // AUTO miners and their suggested hosting line items (shared with the
    // monthly bill estimate and the guild hosting invoice).
    return NextResponse.json(await loadSuggestedHostingLineItems(customerId));
  } catch (error) {
    console.error("Failed to fetch miners:", error);
    return NextResponse.json(
      { error: "Failed to fetch miners" },
      { status: 500 },
    );
  }
}
