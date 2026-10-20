"use client";

import React from "react";
import ForceLightTheme from "@/components/ForceLightTheme";

// Bare pages rendered to PDF by Puppeteer (and previewed in an iframe): no
// app bar or sidebar, always light.
export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ForceLightTheme>{children}</ForceLightTheme>;
}
