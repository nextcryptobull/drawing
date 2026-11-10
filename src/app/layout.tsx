import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Madacan — Scaffold Tower BOM Estimator",
  description:
    "Interactive parametric configurator for scaffold parts: caster wheels, ringlock rosettes, and standards. Live 3D preview, STEP export, and BOM management. By Madacan, Baku.",
  keywords: [
    "Madacan",
    "Baku",
    "scaffold",
    "CAD",
    "configurator",
    "caster",
    "ringlock",
    "STEP",
    "cadquery",
    "Three.js",
  ],
  authors: [{ name: "Madacan" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <SonnerToaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: "border-border",
            },
          }}
        />
      </body>
    </html>
  );
}
