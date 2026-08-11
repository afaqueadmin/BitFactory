/**
 * Memo Email Template
 *
 * Sent to customer when an admin issues a customer-facing memo. A positive
 * amount increases the customer's balance (labeled "Debit Memo" - it debits
 * our revenue); a negative amount decreases it (labeled "Credit Memo" - it
 * credits our revenue back).
 */

export function generateMemoEmailHTML(
  customerName: string,
  memoNumber: string,
  amount: number,
  reason: string,
  invoiceNumber?: string | null,
): string {
  const isDebit = amount >= 0;
  const memoTitleLabel = isDebit ? "Debit Memo" : "Credit Memo";
  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Math.abs(amount));

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #333;
            line-height: 1.6;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .header {
            background-color: #1976d2;
            color: white;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
            text-align: center;
          }
          .content {
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            border-left: 4px solid #1976d2;
          }
          .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #eee;
          }
          .detail-label {
            font-weight: bold;
            color: #666;
          }
          .detail-value {
            color: #333;
          }
          .amount-value {
            color: ${isDebit ? "#2e7d32" : "#c62828"};
            font-weight: bold;
          }
          .footer {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 12px;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>${memoTitleLabel} Issued</h2>
          </div>

          <div class="content">
            <p>Dear ${customerName},</p>

            <p>
              A ${memoTitleLabel.toLowerCase()} has been issued to your account. Please find the details below,
              along with the attached PDF for your records.
            </p>

            <div class="detail-row">
              <span class="detail-label">Memo Number:</span>
              <span class="detail-value">${memoNumber}</span>
            </div>

            ${
              invoiceNumber
                ? `<div class="detail-row">
              <span class="detail-label">Related Invoice:</span>
              <span class="detail-value">${invoiceNumber}</span>
            </div>`
                : ""
            }

            <div class="detail-row">
              <span class="detail-label">${isDebit ? "Debit Amount" : "Credit Amount"}:</span>
              <span class="detail-value amount-value">${formattedAmount}</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">Reason:</span>
              <span class="detail-value">${reason}</span>
            </div>

            <p>
              If you have any questions regarding this ${memoTitleLabel.toLowerCase()}, please contact our support team.
            </p>

            <p>Best regards,<br />BitFactory Team</p>
          </div>

          <div class="footer">
            <p>
              This is an automated email. Please do not reply directly to this message.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}
