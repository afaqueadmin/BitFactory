"use client";
import React from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminSidebar from "@/components/admin/AdminSidebar";
import PasskeySetupPrompt from "@/components/PasskeySetupPrompt";
import { Box } from "@mui/material";
import { AdminNavProvider } from "@/lib/contexts/admin-nav-context";

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminNavProvider>
      <AdminHeader />
      <PasskeySetupPrompt />
      <Box sx={{ display: "flex", height: "calc(100vh - 64px)" }}>
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
            bgcolor: "background.default",
          }}
        >
          {children}
        </Box>
      </Box>
    </AdminNavProvider>
  );
}
