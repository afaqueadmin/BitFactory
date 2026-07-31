"use client";

import React, { Suspense } from "react";
import { CircularProgress, Box } from "@mui/material";
import FranchiseCustomersContent from "@/components/franchise/FranchiseCustomersContent";

export default function FranchiseCustomersPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
          <CircularProgress />
        </Box>
      }
    >
      <FranchiseCustomersContent />
    </Suspense>
  );
}
