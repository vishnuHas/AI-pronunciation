import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PronounceAI — English Pronunciation Assessment",
  description:
    "Upload a 30–45 second audio clip and get instant AI-powered pronunciation feedback with word-by-word analysis.",
  keywords: ["pronunciation", "English", "speech", "assessment", "AI", "language learning"],
  openGraph: {
    title: "PronounceAI — English Pronunciation Assessment",
    description: "Get instant AI-powered pronunciation feedback with word-by-word analysis.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
