// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "BitFactory",
    description: "BitFactory - CryptoMiner Dashboard",
    icons: {
        icon: [
            { url: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        apple: '/favicon.svg', // For Apple devices
        shortcut: '/favicon.svg',
    },
};

import { AuthProvider } from "@/lib/contexts/auth-context";
import { ThemeProvider } from "./theme-provider";

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
        <body
            className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            suppressHydrationWarning={true}
        >
            <AuthProvider>
                <ThemeProvider>
                    {children}
                </ThemeProvider>
            </AuthProvider>
        </body>
        </html>
    );
}
