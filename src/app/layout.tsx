import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ChatProvider } from "@/contexts/ChatContext";
import FloatingChatButton from "@/components/chat/FloatingChatButton";
import FloatingChatWindow from "@/components/chat/FloatingChatWindow";
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
  title: "CRM",
  description: "CRM Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100`}
      >
        <ThemeProvider>
          <ChatProvider>
            <Toaster position="top-right" />
            {children}
            {/* FloatingChatWindow renders below the button in DOM but z-index keeps them separate */}
            <FloatingChatWindow />
            <FloatingChatButton />
          </ChatProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}