import { describe, expect, it } from "vitest";
import { guardMailOptions } from "@/lib/emailSafety";

const mail = {
  to: "client@example.com",
  cc: ["rm@example.com", { name: "Billing", address: "invoices@example.com" }],
  bcc: "audit@example.com",
  subject: "Invoice INV-1",
};

describe("guardMailOptions", () => {
  it("redirects every recipient outside production and keeps them in the subject", () => {
    const result = guardMailOptions(mail, {
      nodeEnv: "development",
      redirectTo: "dev@example.com",
    });
    expect(result).toEqual({
      send: true,
      options: {
        ...mail,
        to: "dev@example.com",
        cc: undefined,
        bcc: undefined,
        subject:
          "[TEST → client@example.com; cc rm@example.com, invoices@example.com; bcc audit@example.com] Invoice INV-1",
      },
    });
  });

  it("sends nothing outside production when no redirect is set", () => {
    expect(guardMailOptions(mail, { nodeEnv: "development" })).toEqual({
      send: false,
    });
    expect(
      guardMailOptions(mail, { nodeEnv: undefined, redirectTo: "  " }),
    ).toEqual({ send: false });
  });

  it("passes production mail through untouched, even with a redirect set", () => {
    expect(
      guardMailOptions(mail, {
        nodeEnv: "production",
        redirectTo: "dev@example.com",
      }),
    ).toEqual({ send: true, options: mail });
  });
});
