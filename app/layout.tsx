import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PrototypeBanner } from "@/components/prototype-banner";
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
  title: "Rahat Rails — Synthetic relief workflow",
  description:
    "A prototype foundation using synthetic data. Not for real citizen use.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-950">
        <PrototypeBanner />
        {children}
        <footer className="border-t border-slate-200 bg-white px-6 py-5 text-center text-xs text-slate-500">
          Rahat Rails is a synthetic prototype. Do not enter real citizen
          information.
        </footer>
      </body>
    </html>
  );
}
