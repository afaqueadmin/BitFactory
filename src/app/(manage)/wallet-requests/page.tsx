import { redirect } from "next/navigation";

// Wallet change requests now live in the Wallets module.
export default function LegacyWalletRequestsPage() {
  redirect("/wallets?tab=change-requests");
}
