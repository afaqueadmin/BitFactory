import { redirect } from "next/navigation";

// Email reports for every invoice type live on one tabbed page.
export default function LegacyEmailReportPage() {
  redirect("/accounting/email-report?type=HARDWARE_REPAIR");
}
