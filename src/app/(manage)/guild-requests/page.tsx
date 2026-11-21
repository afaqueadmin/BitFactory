"use client";

import GuildRequestsPanel from "@/components/guilds/GuildRequestsPanel";

// Split and member requests; reward wallet requests are in the Wallets module.
export default function GuildRequestsPage() {
  return <GuildRequestsPanel kinds={["split", "member"]} />;
}
