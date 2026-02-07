"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import CustomerOverviewContent from "@/components/CustomerOverviewContent";

function LoadingFallback() {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
      }}
    >
      <CircularProgress />
    </Box>
  );
}

export default function CustomerOverviewPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CustomerOverviewContent />
    </Suspense>
  );
}
