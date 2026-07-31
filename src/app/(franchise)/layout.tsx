"use client";
import React from "react";
import FranchiseHeader from "@/components/franchise/FranchiseHeader";
import FranchiseSidebar from "@/components/franchise/FranchiseSidebar";
import PasskeySetupPrompt from "@/components/PasskeySetupPrompt";
import { Box } from "@mui/material";

export default function FranchiseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FranchiseHeader />
      <PasskeySetupPrompt />
      <Box sx={{ display: "flex" }}>
        <FranchiseSidebar />
        <Box
          component="main"
          sx={{
            flex: 1,
            width: "100%",
            bgcolor: "background.default",
          }}
        >
          {children}
        </Box>
      </Box>
    </>
  );
}
