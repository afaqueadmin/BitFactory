"use client";

import React from "react";
import AppBarComponent from "@/components/AppBar";
import UserFooter from "@/components/UserFooter";
import { useAuth } from "@/lib/contexts/auth-context";
import { useTheme } from "@/app/theme-provider";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    // This will throw if not within AuthProvider or ThemeProvider, which is what we want
    useAuth();
    useTheme();

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <AppBarComponent />
            <main style={{ flexGrow: 1, padding: "24px", marginTop: "64px", overflow: "auto" }}>
                {children}
            </main>
            <UserFooter />
        </div>
    );
}
