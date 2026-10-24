import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import PaymentResultView, { type PaymentResultData } from "./PaymentResultView";

interface PageProps {
  // Next 15+: dynamic route params arrive as a Promise.
  params: Promise<{ id: string }>;
}

export default async function PaymentSuccessPage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    redirect("/login");
  }

  let userId!: string;
  let userRole!: string;
  try {
    const decoded = await verifyJwtToken(token);
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
    where: { id },
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
  if (
    userRole !== "ADMIN" &&
    userRole !== "ACCOUNTING" &&
    invoice.userId !== userId
  ) {
    redirect("/invoices");
  }

  const payment = invoice.confirmoPayment;
  const isPaid =
    payment?.status === "CONFIRMED" ||
    payment?.status === "COMPLETED" ||
    invoice.status === "PAID";
  const isProcessing = payment?.status === "PROCESSING";

  // Plain, serialisable data for the client view (Decimals -> strings).
  const data: PaymentResultData = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customer: invoice.user.name || invoice.user.email,
    customerEmail: invoice.user.email,
    totalMiners: invoice.totalMiners ?? null,
    unitPrice: invoice.unitPrice.toString(),
    totalAmount: invoice.totalAmount.toString(),
    state: isPaid ? "paid" : isProcessing ? "processing" : "pending",
    payment: payment
      ? {
          status: payment.status,
          paidCurrency: payment.paidCurrency ?? null,
          paidAmount: payment.paidAmount ? payment.paidAmount.toString() : null,
          transactionHash: payment.transactionHash ?? null,
          confirmedAt: payment.confirmedAt
            ? new Date(payment.confirmedAt).toISOString()
            : null,
          paymentUrl: payment.paymentUrl ?? null,
        }
      : null,
  };

  return <PaymentResultView data={data} />;
}
