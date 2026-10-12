import { describe, expect, it } from "vitest";
// Plain-JS helper used by scripts/rebuild-lost-email-report-rows.js.
import {
  parseAuditEntry,
  planRun,
} from "../../../scripts/lib/email-report-rebuild";

const sent = (
  n: string,
  email: string,
  extra: Record<string, unknown> = {},
) => ({
  action: "INVOICE_SENT_TO_CUSTOMER",
  entityId: `inv-${n}`,
  description: `Invoice ${n} sent to ${email}`,
  changes: JSON.stringify({ sentTo: email, ...extra }),
  createdAt: "2026-10-12 05:36:25.725",
});

const users = new Map([
  ["kitebackup01@gmail.com", { id: "u1", name: "Sheheryar" }],
]);

describe("parseAuditEntry", () => {
  it("reads invoice number, recipient and CC from a sent entry", () => {
    expect(
      parseAuditEntry(
        sent("Sheheryar-20261012-001", "kitebackup01@gmail.com", {
          ccEmails: "rm@bitfactory.ae, invoices@bitfactory.ae",
        }),
        "INVOICE",
      ),
    ).toEqual({
      invoiceId: "inv-Sheheryar-20261012-001",
      documentNumber: "Sheheryar-20261012-001",
      sentTo: "kitebackup01@gmail.com",
      ccEmails: ["rm@bitfactory.ae", "invoices@bitfactory.ae"],
      sentAt: "2026-10-12 05:36:25.725",
    });
  });

  it("reads cancellation entries only for cancellation runs", () => {
    const entry = {
      action: "INVOICE_CANCELLED",
      entityId: "inv-1",
      description: "Invoice X-1 cancelled and sent to a@b.com",
      changes: null,
      createdAt: "t",
    };
    expect(parseAuditEntry(entry, "CANCELLATION")).toMatchObject({
      documentNumber: "X-1",
      sentTo: "a@b.com",
      ccEmails: [],
    });
    expect(parseAuditEntry(entry, "INVOICE")).toBeNull();
  });

  it("ignores cancel-without-email and delete entries", () => {
    for (const description of [
      "Invoice X-1 cancelled by admin",
      "Invoice X-1 deleted",
    ]) {
      expect(
        parseAuditEntry(
          {
            action: "INVOICE_CANCELLED",
            entityId: "i",
            description,
            changes: null,
            createdAt: "t",
          },
          "CANCELLATION",
        ),
      ).toBeNull();
    }
  });
});

describe("planRun", () => {
  const run = { id: "r1", totalInvoices: 3, recordedRows: 2 };

  it("rebuilds exactly the missing rows, deduping repeat sends", () => {
    const c = parseAuditEntry(
      sent("A-1", "kitebackup01@gmail.com"),
      "INVOICE",
    )!;
    const { rows, skipped } = planRun(run, [c, { ...c }], users);
    expect(skipped).toBeNull();
    expect(rows).toEqual([
      expect.objectContaining({
        runId: "r1",
        invoiceId: null,
        documentNumber: "A-1",
        customerId: "u1",
        success: true,
      }),
    ]);
  });

  it("refuses ambiguous runs with more candidates than missing rows", () => {
    const a = parseAuditEntry(
      sent("A-1", "kitebackup01@gmail.com"),
      "INVOICE",
    )!;
    const b = parseAuditEntry(
      sent("A-2", "kitebackup01@gmail.com"),
      "INVOICE",
    )!;
    const { rows, skipped } = planRun(run, [a, b], users);
    expect(rows).toEqual([]);
    expect(skipped).toMatch(/ambiguous/);
  });

  it("skips recipients with no user account", () => {
    const c = parseAuditEntry(sent("A-1", "ghost@example.com"), "INVOICE")!;
    const { rows, skipped } = planRun(run, [c], users);
    expect(rows).toEqual([]);
    expect(skipped).toMatch(/no user for ghost@example.com/);
  });
});
