// Pure helpers for scripts/rebuild-lost-email-report-rows.js: turn audit-log
// entries into email_send_results rows for runs that lost rows when their
// invoices were deleted (the FK used to cascade). No DB access here so the
// matching rules can be unit-tested.

const DESCRIPTION_PATTERNS = {
  INVOICE: /^Invoice (\S+) sent to (\S+@\S+)$/,
  CANCELLATION: /^Invoice (\S+) cancelled and sent to (\S+@\S+)$/,
};

const AUDIT_ACTION_FOR_KIND = {
  INVOICE: "INVOICE_SENT_TO_CUSTOMER",
  CANCELLATION: "INVOICE_CANCELLED",
};

function parseChanges(changes) {
  if (!changes) return {};
  if (typeof changes === "object") return changes;
  try {
    const parsed = JSON.parse(changes);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Read invoice number, recipient and CC list from one audit entry, or null
 * when it isn't an email-sent entry for this run kind.
 */
function parseAuditEntry(entry, kind) {
  const pattern = DESCRIPTION_PATTERNS[kind];
  if (!pattern || entry.action !== AUDIT_ACTION_FOR_KIND[kind]) return null;
  const match = pattern.exec((entry.description || "").trim());
  if (!match) return null;

  const changes = parseChanges(entry.changes);
  const sentTo =
    typeof changes.sentTo === "string" && changes.sentTo.trim()
      ? changes.sentTo.trim()
      : match[2];
  const ccEmails =
    typeof changes.ccEmails === "string"
      ? changes.ccEmails
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      : [];

  return {
    invoiceId: entry.entityId,
    documentNumber: match[1],
    sentTo,
    ccEmails,
    sentAt: entry.createdAt,
  };
}

/**
 * Decide the rows to rebuild for one short run.
 * candidates: parsed entries for invoices not already in the run.
 * usersByEmail: Map(lowercased email -> { id, name }).
 * Returns { rows, skipped } where skipped explains anything left out.
 */
function planRun(run, candidates, usersByEmail) {
  const missing = run.totalInvoices - run.recordedRows;
  if (missing <= 0) return { rows: [], skipped: "run is not short" };

  // One entry per invoice (a resend inside the window must not double up).
  const byInvoice = new Map();
  for (const c of candidates) {
    if (!byInvoice.has(c.invoiceId)) byInvoice.set(c.invoiceId, c);
  }
  const unique = [...byInvoice.values()];

  if (unique.length === 0) return { rows: [], skipped: "no audit entries" };
  if (unique.length > missing) {
    return {
      rows: [],
      skipped: `${unique.length} candidates for ${missing} missing rows (ambiguous)`,
    };
  }

  const rows = [];
  const unmatched = [];
  for (const c of unique) {
    const user = usersByEmail.get(c.sentTo.toLowerCase());
    if (!user) {
      unmatched.push(`${c.documentNumber}: no user for ${c.sentTo}`);
      continue;
    }
    rows.push({
      runId: run.id,
      invoiceId: null,
      memoId: null,
      documentNumber: c.documentNumber,
      customerId: user.id,
      customerName: user.name || "Unknown",
      customerEmail: c.sentTo,
      ccEmails: c.ccEmails.length ? c.ccEmails.join(",") : null,
      success: true,
      errorMessage: null,
      sentAt: c.sentAt,
    });
  }

  return {
    rows,
    skipped: unmatched.length ? unmatched.join("; ") : null,
  };
}

module.exports = { AUDIT_ACTION_FOR_KIND, parseAuditEntry, planRun };
