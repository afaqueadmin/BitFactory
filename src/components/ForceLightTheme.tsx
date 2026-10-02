"use client";

import React, { useEffect } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeContext } from "@/app/theme-provider";

const lightTheme = createTheme({ palette: { mode: "light" } });

const forcedLight = { darkMode: false, toggleDarkMode: () => {} };

/**
 * Renders children in the light theme regardless of the user's saved
 * darkMode preference or the device theme. Used by the unauthenticated
 * pages (welcome, login, reset-password), which should always be light.
 */
export default function ForceLightTheme({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.colorScheme;
    root.style.colorScheme = "light";
    return () => {
      root.style.colorScheme = previous;
    };
  }, []);

  return (
    <ThemeContext.Provider value={forcedLight}>
      <ThemeProvider theme={lightTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}
