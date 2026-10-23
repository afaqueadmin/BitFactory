"use client";
import React from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminSidebar from "@/components/admin/AdminSidebar";
import PasskeySetupPrompt from "@/components/PasskeySetupPrompt";
import TwoFactorReminder from "@/components/TwoFactorReminder";
import { Box } from "@mui/material";
import { AdminNavProvider } from "@/lib/contexts/admin-nav-context";

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminNavProvider>
      {/* App shell: exactly one viewport tall, the header (and any prompt
          banners) take their natural height and the sidebar + content fill
          the rest. Only <main> scrolls, so the page never gets a second
          scrollbar whatever the header's exact height is. dvh tracks the
          mobile browser toolbar; vh is the fallback. */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          "@supports (height: 100dvh)": { height: "100dvh" },
          overflow: "hidden",
        }}
      >
        <AdminHeader />
        <PasskeySetupPrompt />
        <TwoFactorReminder />
        <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
          <AdminSidebar />
          <Box
            component="main"
            sx={{
              flex: 1,
              width: "100%",
              minWidth: 0,
              height: "100%",
              overflowX: "hidden",
              overflowY: "auto",
              overscrollBehavior: "contain",
              bgcolor: "background.default",
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </AdminNavProvider>
  );
}
