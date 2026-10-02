"use client";

import React from "react";
import ForceLightTheme from "@/components/ForceLightTheme";

// Public pages (login, reset-password) are always light.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ForceLightTheme>{children}</ForceLightTheme>;
}
