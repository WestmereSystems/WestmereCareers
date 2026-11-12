import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header, Footer } from "@/components/shell";

export const metadata: Metadata = {
  title: {
    default: "Westmere Careers — Your career starts with Westmere",
    template: "%s | Westmere Careers",
  },
  description:
    "Find your next role with a clearer picture of the work, the pay and the people hiring. A thoughtful Australian careers marketplace.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  robots: {
    index: process.env.ALLOW_INDEXING === "true",
    follow: process.env.ALLOW_INDEXING === "true",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5eb" },
    { media: "(prefers-color-scheme: dark)", color: "#132623" },
  ],
};
const themeScript = `try{var t=localStorage.getItem('westmere-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <Header />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
