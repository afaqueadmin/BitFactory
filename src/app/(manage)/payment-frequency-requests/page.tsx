import { redirect } from "next/navigation";

// Payment frequency requests now live in the Wallets module.
export default function LegacyPaymentFrequencyRequestsPage() {
  redirect("/wallets?tab=frequency");
}
