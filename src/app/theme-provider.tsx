"use client";

import * as React from "react";
import {
  createTheme,
  ThemeProvider as MuiThemeProvider,
  CssBaseline,
} from "@mui/material";

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export const ThemeContext = React.createContext<ThemeContextType | undefined>(
  undefined,
);

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

const DARK_MODE_COOKIE = "darkMode";

export function ThemeProvider({
  children,
  initialDarkMode = false,
}: {
  children: React.ReactNode;
  initialDarkMode?: boolean;
}) {
  // Seeded from the darkMode cookie read server-side in the root layout, so
  // the first client render matches the SSR'd markup exactly - reading
  // localStorage here instead would diverge from the server render and
  // cause a hydration flash/mismatch on every hard refresh.
  const [darkMode, setDarkMode] = React.useState(initialDarkMode);

  React.useEffect(() => {
    document.cookie = `${DARK_MODE_COOKIE}=${darkMode}; path=/; max-age=31536000; samesite=lax`;
  }, [darkMode]);

  const toggleDarkMode = React.useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: darkMode ? "dark" : "light",
          ...(darkMode
            ? {}
            : {
                // Light theme customizations for better white theme
                primary: {
                  main: "#1976d2", // Blue primary color
                },
                secondary: {
                  main: "#dc004e", // Pink secondary color
                },
                background: {
                  default: "#ffffff", // Pure white background
                  paper: "#ffffff", // White paper background
                },
                text: {
                  primary: "#000000", // Black text for contrast
                  secondary: "#555555", // Dark gray for secondary text
                },
              }),
        },
        components: {
          // Ensure components use white background in light mode
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundColor: darkMode ? undefined : "#ffffff",
              },
            },
          },
          MuiAppBar: {
            styleOverrides: {
              root: {
                backgroundColor: darkMode ? undefined : "#ffffff",
                color: darkMode ? undefined : "#000000",
              },
            },
          },
        },
      }),
    [darkMode],
  );

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export default ThemeProvider;
