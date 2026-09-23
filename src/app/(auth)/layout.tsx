"use client";

import React from "react";
import { Box } from "@mui/material";
import { usePathname } from "next/navigation";
import AppBarComponent from "@/components/AppBar";
import UserFooter from "@/components/UserFooter";
import PasskeySetupPrompt from "@/components/PasskeySetupPrompt";
import { useAuth } from "@/lib/contexts/auth-context";
import { SubaccountFilterProvider } from "@/lib/contexts/subaccountFilter-context";
import { useTheme } from "@/app/theme-provider";
import { HEADER_HEIGHT, MQ, useDaylight } from "@/lib/daylight";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This will throw if not within AuthProvider or ThemeProvider, which is what we want
  useAuth();
  useTheme();
  const { d } = useDaylight();
  const pathname = usePathname();

  // The Daylight page treatment (pale canvas, guide padding) is currently
  // rolled out on the client dashboard only; other client pages keep their
  // existing look and only pick up the new header.
  const isDaylightPage = pathname === "/dashboard";

  return (
    <SubaccountFilterProvider>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          ...(isDaylightPage && { backgroundColor: d.canvas }),
        }}
      >
        <AppBarComponent />
        <PasskeySetupPrompt />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            // Clear the fixed header: 76px top bar, 72px mobile top bar.
            marginTop: `${HEADER_HEIGHT.desktop}px`,
            [MQ.mobile]: { marginTop: `${HEADER_HEIGHT.mobile}px` },
            overflow: "auto",
            padding: isDaylightPage
              ? { xs: "24px 18px", md: "32px 36px" }
              : "clamp(12px, 5vw, 24px)",
          }}
        >
          {children}
        </Box>
        <UserFooter />
      </Box>
    </SubaccountFilterProvider>
  );
}
