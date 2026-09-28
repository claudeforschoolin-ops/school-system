import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@/styles/globals.css";
import { Providers } from "@/components/providers";
import { thmanyahFontFaceCss } from "@/lib/fonts";

export const metadata: Metadata = {
  title: { default: "منصة — نظام إدارة المدارس", template: "%s — منصة" },
  description: "نظام متكامل لإدارة المدارس مع نظام محاسبي مدمج",
  applicationName: "منصة",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
  ],
  width: "device-width",
  initialScale: 1,
};

/** سكربت يمنع وميض السمة: يطبق الوضع المحفوظ قبل الرسم */
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )manassa_theme=([^;]+)/);var t=m?decodeURIComponent(m[1]):"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("manassa_theme")?.value;
  const serverTheme = theme === "dark" ? "dark" : theme === "light" ? "light" : undefined;
  const fontFaces = thmanyahFontFaceCss();
  return (
    <html lang="ar" dir="rtl" data-theme={serverTheme} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {fontFaces ? <style dangerouslySetInnerHTML={{ __html: fontFaces }} /> : null}
      </head>
      <body className="bg-app text-fg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
