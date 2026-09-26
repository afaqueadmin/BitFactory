import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn());

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));
// email.ts imports these at module load; none are needed for these emails.
vi.mock("puppeteer", () => ({ default: {} }));
vi.mock("puppeteer-core", () => ({ default: {} }));
vi.mock("@sparticuz/chromium-min", () => ({ default: {} }));

import {
  sendEmailChangeNotificationEmail,
  sendPasskeyRegisteredEmail,
  sendPasskeyRemovedEmail,
  sendTwoFactorDisabledEmail,
  sendTwoFactorEnabledEmail,
  type SecurityEventDetails,
} from "@/lib/email";

const details: SecurityEventDetails = {
  ipAddress: "203.0.113.7",
  userAgent: "Mozilla/5.0 (Test)",
  occurredAt: new Date("2026-09-21T10:30:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sendMail.mockResolvedValue({});
});

describe("security notification emails", () => {
  it.each([
    [
      "2FA enabled",
      sendTwoFactorEnabledEmail,
      "Two-Factor Authentication Enabled",
    ],
    [
      "2FA disabled",
      sendTwoFactorDisabledEmail,
      "Two-Factor Authentication Disabled",
    ],
    ["passkey added", sendPasskeyRegisteredEmail, "New Passkey Added"],
    ["passkey removed", sendPasskeyRemovedEmail, "Passkey Removed"],
  ])(
    "%s goes to the account email with the event details",
    async (_n, send, heading) => {
      const result = await send("owner@example.com", details);

      expect(result).toEqual({ success: true });
      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe("owner@example.com");
      expect(mail.subject).toContain(heading);
      expect(mail.html).toContain(`<h1>${heading}</h1>`);
      expect(mail.html).toContain("203.0.113.7");
      expect(mail.html).toContain("Mozilla/5.0 (Test)");
    },
  );

  it("email change is sent to the OLD address and names both", async () => {
    await sendEmailChangeNotificationEmail(
      "old@example.com",
      "new@example.com",
      details,
    );

    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("old@example.com");
    expect(mail.html).toContain("old@example.com");
    expect(mail.html).toContain("new@example.com");
  });

  it("escapes attacker-controlled values instead of injecting HTML", async () => {
    await sendEmailChangeNotificationEmail(
      "old@example.com",
      "<script>alert(1)</script>@evil.com",
      {
        ...details,
        ipAddress: "<img src=x onerror=alert(1)>",
        userAgent: "<script>steal()</script>",
      },
    );

    const html: string = sendMail.mock.calls[0][0].html;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;steal()&lt;/script&gt;");
  });

  it("reports failure instead of throwing when the mail server rejects", async () => {
    sendMail.mockRejectedValue(new Error("smtp down"));

    const result = await sendTwoFactorEnabledEmail(
      "owner@example.com",
      details,
    );

    expect(result.success).toBe(false);
  });
});
