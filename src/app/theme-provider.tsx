"use client";

import * as React from "react";
import { createTheme, ThemeProvider as MuiThemeProvider, CssBaseline } from "@mui/material";

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [darkMode, setDarkMode] = React.useState(() => {
        // Try to get the saved preference, fallback to light mode (white theme)
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('darkMode');
            if (saved !== null) {
                return saved === 'true';
            }
            // Default to light mode (white theme) instead of system preference
            return false;
        }
        // Default to light mode (white theme) for SSR
        return false;
    });

    // Force reset to light mode on first load (optional - uncomment if you want to override all user preferences)
    // React.useEffect(() => {
    //     setDarkMode(false);
    //     localStorage.setItem('darkMode', 'false');
    // }, []);

    React.useEffect(() => {
        localStorage.setItem('darkMode', darkMode.toString());
    }, [darkMode]);

    const toggleDarkMode = React.useCallback(() => {
        setDarkMode(prev => !prev);
    }, []);

    const theme = React.useMemo(
        () =>
            createTheme({
                palette: {
                    mode: darkMode ? "dark" : "light",
                    ...(darkMode ? {} : {
                        // Light theme customizations for better white theme
                        primary: {
                            main: '#1976d2', // Blue primary color
                        },
                        secondary: {
                            main: '#dc004e', // Pink secondary color
                        },
                        background: {
                            default: '#ffffff', // Pure white background
                            paper: '#ffffff', // White paper background
                        },
                        text: {
                            primary: '#000000', // Black text for contrast
                            secondary: '#555555', // Dark gray for secondary text
                        },
                    }),
                },
                components: {
                    // Ensure components use white background in light mode
                    MuiPaper: {
                        styleOverrides: {
                            root: {
                                backgroundColor: darkMode ? undefined : '#ffffff',
                            },
                        },
                    },
                    MuiAppBar: {
                        styleOverrides: {
                            root: {
                                backgroundColor: darkMode ? undefined : '#ffffff',
                                color: darkMode ? undefined : '#000000',
                            },
                        },
                    },
                },
            }),
        [darkMode]
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
