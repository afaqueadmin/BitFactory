import { redirect } from "next/navigation";

// Capital & Income Heads moved to the Heads tab on Capital & Income; keep
// old links working.
export default function CapitalIncomeHeadsPage() {
  redirect("/accounting/capital-income?tab=heads");
}
