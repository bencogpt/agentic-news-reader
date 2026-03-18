import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Agentic News Reader",
    template: "%s | Agentic News Reader",
  },
  description: "AI-powered research assistant that reads hundreds of news articles to answer your questions. Watch multiple agents search, read, and synthesize information in real-time.",
  keywords: ["news", "AI", "research", "assistant", "news reader", "agentic", "LLM"],
  authors: [{ name: "Agentic News Reader" }],
  openGraph: {
    title: "Agentic News Reader",
    description: "AI-powered research assistant that reads hundreds of news articles to answer your questions.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agentic News Reader",
    description: "AI-powered research assistant that reads hundreds of news articles to answer your questions.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
