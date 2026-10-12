import { redirect } from "next/navigation";

// Email reports for every invoice type live on one tabbed page.
export default async function LegacyEmailReportDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  redirect(`/accounting/email-report/${encodeURIComponent(runId)}`);
}
