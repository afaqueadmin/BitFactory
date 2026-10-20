/**
 * Wallet Snapshot Email Template
 *
 * Sent by an admin with a PDF of the customer's wallet overview attached.
 * The body is admin-editable plain text: blank lines separate paragraphs,
 * single newlines become line breaks and http(s) URLs become links. Pure
 * (no server imports) so the compose page can render the same preview.
 */

const escapeText = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const linkify = (escaped: string): string =>
  escaped.replace(
    /https?:\/\/[^\s<]+[^\s<.,;:!?)]/g,
    (url) => `<a href="${url}" style="color: #1976d2;">${url}</a>`,
  );

/** Formats the snapshot date the way the subject and body show it. */
export const formatSnapshotDate = (date: Date): string =>
  date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Dubai",
  });

export function defaultWalletSnapshotSubject(date: Date): string {
  return `Your BitFactory Wallet Summary - ${formatSnapshotDate(date)}`;
}

export function defaultWalletSnapshotBody(
  customerName: string,
  date: Date,
  isSimulated: boolean,
): string {
  const wallet = isSimulated
    ? "simulated BitFactory wallet"
    : "BitFactory wallet";
  return [
    `Dear ${customerName},`,
    `Please find attached a snapshot of your ${wallet} as of ${formatSnapshotDate(date)}. It includes your total earnings, 24-hour revenue, pending payouts, payout settings and profit & loss overview.`,
    "You can view your live wallet any time at https://bitfactory.ae/wallet.",
    "Best regards,\nBitFactory Team",
  ].join("\n\n");
}

export function renderWalletSnapshotEmailHTML(body: string): string {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin: 0 0 14px;">${linkify(escapeText(p)).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
      </head>
      <body style="margin: 0; font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: #0f766e; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 20px;">Your Wallet Summary</h2>
          </div>
          <div style="background-color: white; padding: 20px; border-radius: 5px; border-left: 4px solid #0f766e;">
            ${paragraphs}
          </div>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center;">
            <p style="margin: 0;">The wallet summary PDF is attached to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
