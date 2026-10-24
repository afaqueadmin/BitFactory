"use client";

import PaybackAnalysisPage from "@/app/(auth)/payback-analysis/page";
import { DaylightAdminPage } from "@/components/daylight/AdminPage";

// The client page is already Daylight-styled; DaylightAdminPage supplies the
// canvas and padding the client layout would otherwise provide.
export default function AdminPaybackAnalysisPage() {
  return (
    <DaylightAdminPage>
      <PaybackAnalysisPage />
    </DaylightAdminPage>
  );
}
