import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aether Chess — Modern 3D Chess",
  description: "Play a complete game of chess against a tactical engine or a local opponent in a modern glass arena.",
  openGraph: {
    title: "Aether Chess — Play the next move.",
    description: "Complete chess, a tactical engine, and local competition in a modern glass arena.",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Aether Chess glass chess arena" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aether Chess — Play the next move.",
    description: "Complete modern 3D chess in your browser.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geist.variable} ${mono.variable}`}>{children}</body></html>;
}
