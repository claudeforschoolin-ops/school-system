import type { Metadata, Viewport } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource-variable/hanken-grotesk/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./globals.css";
import { MarkSprite } from "@/components/brand/mark";
import { RevealObserver } from "@/components/motion/reveal-observer";
import { hero, site } from "@/content/site";

const title = `${site.name} — ${hero.headline.replace(/\.$/, "")}`;

export const metadata: Metadata = {
  title,
  description: hero.sub,
  applicationName: site.name,
  openGraph: {
    type: "website",
    siteName: site.name,
    title,
    description: hero.sub,
  },
  twitter: { card: "summary", title, description: hero.sub },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f4b8f",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MarkSprite />
        <RevealObserver />
        <a
          href="#main"
          className="text-caption sr-only rounded-control border border-ink bg-paper px-3 py-2 text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
