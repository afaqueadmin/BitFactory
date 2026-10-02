// app/layout.tsx
import type { Metadata, Viewport } from "next";
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

// Theme follows the app's darkMode cookie (light by default), never the
// device's prefers-color-scheme. "only light" also opts out of mobile
// browsers' automatic dark rendering.
export async function generateViewport(): Promise<Viewport> {
  const cookieStore = await cookies();
  const darkMode = cookieStore.get("darkMode")?.value === "true";
  return {
    themeColor: darkMode ? "#090d16" : "#0f766e",
    colorScheme: darkMode ? "dark" : "only light",
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    viewportFit: "cover",
  };
}

export const metadata: Metadata = {
  title: "BitFactory",
  description: "BitFactory - CryptoMiner Dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BitFactory",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/app-icon.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      { url: "/icons/app-icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
  },
};

import { cookies } from "next/headers";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { AuthProvider } from "@/lib/contexts/auth-context";
import { ThemeProvider } from "./theme-provider";
import { Providers } from "@/providers/QueryProvider";
import PwaRegister from "@/components/pwa/PwaRegister";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialDarkMode = cookieStore.get("darkMode")?.value === "true";

  return (
    <html
      lang="en"
      style={{ colorScheme: initialDarkMode ? "dark" : "light" }}
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        <AppRouterCacheProvider options={{ key: "mui" }}>
          <AuthProvider>
            <ThemeProvider initialDarkMode={initialDarkMode}>
              <Providers>
                <PwaRegister />
                {children}
              </Providers>
            </ThemeProvider>
          </AuthProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
