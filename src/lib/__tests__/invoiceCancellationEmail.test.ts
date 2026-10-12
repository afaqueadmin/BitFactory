import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn());

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));
vi.mock("puppeteer", () => ({ default: {} }));
vi.mock("puppeteer-core", () => ({ default: {} }));
vi.mock("@sparticuz/chromium-min", () => ({ default: {} }));

import { sendInvoiceCancellationEmail } from "@/lib/email";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sendMail.mockResolvedValue({});
});

describe("invoice cancellation email", () => {
  it("includes the relationship manager and billing inbox in cc recipients", async () => {
    const result = await sendInvoiceCancellationEmail(
      "customer@example.com",
      "Jane Customer",
      "INV-1001",
      250,
      new Date("2026-10-12T00:00:00.000Z"),
      ["rm@bitfactory.ae", "invoices@bitfactory.ae"],
    );

    expect(result).toEqual({
      success: true,
      ccEmails: ["rm@bitfactory.ae", "invoices@bitfactory.ae"],
    });

    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("customer@example.com");
    expect(mail.cc).toBe("rm@bitfactory.ae,invoices@bitfactory.ae");
  });
});
