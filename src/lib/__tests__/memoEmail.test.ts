import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn());

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));
vi.mock("puppeteer", () => ({ default: {} }));
vi.mock("puppeteer-core", () => ({ default: {} }));
vi.mock("@sparticuz/chromium-min", () => ({ default: {} }));

import { sendMemoEmail, sendMemoVoidEmail } from "@/lib/email";

const pdf = Buffer.from("%PDF-test");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sendMail.mockResolvedValue({});
});

describe("memo email", () => {
  it("ccs the relationship manager and billing inbox, deduped", async () => {
    const result = await sendMemoEmail(
      "customer@example.com",
      "Jane Customer",
      "MEMO-abc-20261012-001",
      -40,
      "Goodwill credit",
      pdf,
      null,
      ["rm@bitfactory.ae", "invoices@bitfactory.ae", "rm@bitfactory.ae"],
    );

    expect(result).toEqual({
      success: true,
      ccEmails: ["rm@bitfactory.ae", "invoices@bitfactory.ae"],
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("customer@example.com");
    expect(mail.cc).toBe("rm@bitfactory.ae,invoices@bitfactory.ae");
    expect(mail.subject).toBe("Credit Memo MEMO-abc-20261012-001 - BitFactory");
    expect(mail.attachments[0].content).toBe(pdf);
  });

  it("reports failure instead of throwing when the send fails", async () => {
    sendMail.mockRejectedValueOnce(new Error("SMTP down"));

    const result = await sendMemoEmail(
      "customer@example.com",
      "Jane Customer",
      "MEMO-abc-20261012-002",
      10,
      "Late fee",
      pdf,
    );

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ error: new Error("SMTP down") });
  });
});

describe("memo void email", () => {
  it("sends the voided PDF with the void reason, cc'd like the memo", async () => {
    const result = await sendMemoVoidEmail(
      "customer@example.com",
      "Jane <Customer>",
      "MEMO-abc-20261012-001",
      25,
      "Issued in error",
      pdf,
      "INV-1001",
      ["rm@bitfactory.ae", "invoices@bitfactory.ae"],
    );

    expect(result).toEqual({
      success: true,
      ccEmails: ["rm@bitfactory.ae", "invoices@bitfactory.ae"],
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.cc).toBe("rm@bitfactory.ae,invoices@bitfactory.ae");
    expect(mail.subject).toBe(
      "Debit Memo MEMO-abc-20261012-001 - Voided - BitFactory",
    );
    expect(mail.attachments[0].filename).toBe(
      "DebitMemo_MEMO-abc-20261012-001_VOIDED.pdf",
    );
    expect(mail.html).toContain("Issued in error");
    expect(mail.html).toContain("INV-1001");
    // Customer-supplied text is escaped in the void template.
    expect(mail.html).toContain("Jane &lt;Customer&gt;");
  });
});

describe("memo PDF template", () => {
  it("shows the VOIDED banner and void reason only for voided memos", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const { renderInvoiceTemplate } = await import("@/lib/email");
    const template = readFileSync(
      join(process.cwd(), "src/lib/email-templates/memo-pdf.html"),
      "utf-8",
    );
    const base = {
      memoNumber: "MEMO-abc-20261012-001",
      memoTitleLabel: "DEBIT MEMO",
      hasInvoiceNumber: false,
    };

    const issued = renderInvoiceTemplate(template, {
      ...base,
      voided: false,
      voidReason: "",
    });
    expect(issued).not.toContain('class="void-banner"');
    expect(issued).not.toContain("VOID REASON:");

    const voided = renderInvoiceTemplate(template, {
      ...base,
      voided: true,
      voidReason: "Issued in error",
    });
    expect(voided).toContain('<div class="void-banner">VOIDED</div>');
    expect(voided).toContain("VOID REASON:");
    expect(voided).toContain("Issued in error");
  });
});
