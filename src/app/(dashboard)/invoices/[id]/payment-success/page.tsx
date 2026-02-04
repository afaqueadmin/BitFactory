import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

interface PageProps {
  params: { id: string };
}

export default async function PaymentSuccessPage({ params }: PageProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    redirect("/login");
  }

  let userId!: string;
  let userRole!: string;
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    ) as { userId: string };
    userId = decoded.userId;

    // Get user role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    userRole = user?.role || "CLIENT";
  } catch {
    redirect("/login");
    return;
  }

  // Fetch invoice with payment details
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      confirmoPayment: true,
    },
  });

  if (!invoice) {
    redirect("/invoices");
  }

  // Only allow customer or admin to view
  if (userRole !== "ADMIN" && invoice.userId !== userId) {
    redirect("/invoices");
  }

  const payment = invoice.confirmoPayment;
  const isPaid =
    payment?.status === "CONFIRMED" ||
    payment?.status === "COMPLETED" ||
    invoice.status === "PAID";
  const isProcessing = payment?.status === "PROCESSING";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div
          className={`px-8 pt-8 pb-6 ${isPaid ? "bg-green-50" : isProcessing ? "bg-yellow-50" : "bg-gray-50"}`}
        >
          <div className="text-center">
            {isPaid ? (
              <>
                <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <svg
                    className="w-20 h-20 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Payment Successful! 🎉
                </h1>
                <p className="text-lg text-gray-600">
                  Your cryptocurrency payment has been confirmed
                </p>
              </>
            ) : isProcessing ? (
              <>
                <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <svg
                    className="w-20 h-20 text-yellow-500 animate-pulse"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Payment Processing ⏳
                </h1>
                <p className="text-lg text-gray-600">
                  Waiting for blockchain confirmation
                </p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <svg
                    className="w-20 h-20 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Payment Pending
                </h1>
                <p className="text-lg text-gray-600">
                  Complete your payment to proceed
                </p>
              </>
            )}
          </div>
        </div>

        {/* Invoice Details - Data from Create Form */}
        <div className="px-8 py-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Invoice Details
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Invoice Number</p>
              <p className="text-lg font-medium text-gray-900">
                {invoice.invoiceNumber}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Customer</p>
              <p className="text-lg font-medium text-gray-900">
                {invoice.user.name || invoice.user.email}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Number of Miners</p>
              <p className="text-lg font-medium text-gray-900">
                {invoice.totalMiners}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Unit Price</p>
              <p className="text-lg font-medium text-gray-900">
                ${invoice.unitPrice.toString()}/miner
              </p>
            </div>

            <div className="col-span-2 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <p className="text-lg text-gray-600">Total Amount</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${invoice.totalAmount.toString()}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Electricity charges for the period
              </p>
            </div>
          </div>
        </div>

        {/* Payment Status */}
        {payment && (
          <div className="px-8 py-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Payment Information
            </h2>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Payment Status</span>
                <span
                  className={`font-medium px-3 py-1 rounded-full text-xs ${
                    isPaid
                      ? "bg-green-100 text-green-800"
                      : isProcessing
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {payment.status}
                </span>
              </div>

              {payment.paidCurrency && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Paid with</span>
                  <span className="font-medium text-gray-900">
                    {payment.paidCurrency}
                  </span>
                </div>
              )}

              {payment.paidAmount && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Amount Paid</span>
                  <span className="font-medium text-gray-900">
                    {payment.paidAmount.toString()} {payment.paidCurrency}
                  </span>
                </div>
              )}

              {payment.transactionHash && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Transaction Hash</span>
                  <span className="font-mono text-xs text-blue-600 break-all">
                    {payment.transactionHash.slice(0, 20)}...
                  </span>
                </div>
              )}

              {payment.confirmedAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Confirmed At</span>
                  <span className="font-medium text-gray-900">
                    {new Date(payment.confirmedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status Message */}
        <div className="px-8 py-6">
          {isPaid ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                ✅ <strong>Payment Confirmed</strong>
                <br />
                Your invoice has been paid and your miners will remain active. A
                confirmation email has been sent to{" "}
                <strong>{invoice.user.email}</strong>
              </p>
            </div>
          ) : isProcessing ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                ⏳ <strong>Blockchain Confirmation Pending</strong>
                <br />
                Your payment is being confirmed on the blockchain. This
                typically takes 10-30 minutes. You&apos;ll receive an email once
                confirmed.
              </p>
            </div>
          ) : payment?.paymentUrl ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  💳 <strong>Complete Your Payment</strong>
                  <br />
                  Click the button below to pay with cryptocurrency
                </p>
              </div>

              <a
                href={payment.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-blue-600 text-white text-center py-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Pay Now with Crypto →
              </a>

              <p className="text-xs text-gray-500 text-center">
                Supported: BTC, ETH, USDT, USDC, and more
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                Payment link not available. Please contact support.
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-8 pb-8 space-y-3">
          <Link
            href={`/invoices/${invoice.id}`}
            className="flex items-center justify-center w-full bg-gray-100 text-gray-900 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            View Invoice Details
          </Link>

          <Link
            href="/invoices"
            className="flex items-center justify-center w-full text-gray-600 py-2 hover:text-gray-900 transition-colors"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to All Invoices
          </Link>
        </div>

        {/* Support Footer */}
        <div className="px-8 py-6 bg-gray-50 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            Need help?{" "}
            <a
              href="mailto:admin@bitfactory.ae"
              className="text-blue-600 hover:underline font-medium"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
