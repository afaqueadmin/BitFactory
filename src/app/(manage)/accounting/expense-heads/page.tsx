import { redirect } from "next/navigation";

// Expense Heads moved to the Heads tab on Expenses; keep old links working.
export default function ExpenseHeadsPage() {
  redirect("/accounting/expenses?tab=heads");
}
