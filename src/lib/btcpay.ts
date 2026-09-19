const BTCPAY_URL = process.env.BTCPAY_URL!;
const BTCPAY_API_KEY = process.env.BTCPAY_API_KEY!;
const BTCPAY_STORE_ID = process.env.BTCPAY_STORE_ID!;

// Same flag that controls the "Pay with Bitcoin" button in the UI.
export function isBtcpayEnabled() {
  return process.env.NEXT_PUBLIC_BTCPAY_ENABLED === "true";
}

export async function createBtcpayInvoice({
  amount,
  currency,
  invoiceId,
  clientEmail,
  redirectUrl,
}: {
  amount: number;
  currency: string;
  invoiceId: string;
  clientEmail?: string;
  redirectUrl: string;
}) {
  const res = await fetch(
    `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${BTCPAY_API_KEY}`,
      },
      body: JSON.stringify({
        amount: amount.toString(),
        currency,
        metadata: {
          orderId: invoiceId,
          buyerEmail: clientEmail,
        },
        checkout: {
          redirectURL: redirectUrl,
          expirationMinutes: 60,
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`BTCPay invoice creation failed: ${await res.text()}`);
  }

  return res.json(); // { id, checkoutLink, status, ... }
}
