import type { Metadata } from "next";
import "./globals.css";
import { Providers } from './providers'; // Import the new file

export const metadata: Metadata = {
  title: "One Nation One Election",
  description: "Blockchain Voting System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}