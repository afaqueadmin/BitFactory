/**
 * Invoice Cancellation Email Template
 *
 * Sent to customer when an invoice is cancelled by admin
 */

export function generateInvoiceCancellationEmailHTML(
  customerName: string,
  invoiceNumber: string,
  totalAmount: number,
  originalDueDate: Date,
): string {
  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(totalAmount);

  const formattedDueDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(originalDueDate);

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
            background-color: #dc3545;
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
            border-left: 4px solid #dc3545;
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
          .footer {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 12px;
            color: #999;
            text-align: center;
          }
          .important-note {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 3px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Invoice Cancelled</h2>
          </div>

          <div class="content">
            <p>Dear ${customerName},</p>

            <p>
              We are writing to inform you that the following invoice has been cancelled:
            </p>

            <div class="detail-row">
              <span class="detail-label">Invoice Number:</span>
              <span class="detail-value">${invoiceNumber}</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">Invoice Amount:</span>
              <span class="detail-value">${formattedAmount}</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">Original Due Date:</span>
              <span class="detail-value">${formattedDueDate}</span>
            </div>

            <div class="important-note">
              <strong>Important:</strong> No payment is required for this invoice. 
              Please disregard any previous payment instructions.
            </div>

            <p>
              If you have any questions regarding this cancellation, please contact our support team.
            </p>

            <p>
              Thank you for your business.
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
