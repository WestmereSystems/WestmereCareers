import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./refresh.css";
import "./employer.css";
import { marketplaceOpen } from "@/lib/server/launch";
import { Providers } from "@/components/providers";
import { Header, Footer } from "@/components/shell";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const indexed =
    process.env.ALLOW_INDEXING === "true" && (await marketplaceOpen());
  return {
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
      index: indexed,
      follow: indexed,
    },
  };
}
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b1210" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1210" },
  ],
};
const themeScript = `try{var t=localStorage.getItem('westmere-theme');document.documentElement.dataset.theme=['light','dark','system'].includes(t)?t:'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const launchOpen = await marketplaceOpen();
  return (
    <html lang="en-AU" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers launchOpen={launchOpen}>
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
