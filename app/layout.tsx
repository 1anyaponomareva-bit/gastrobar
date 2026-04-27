import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FavoritesProvider } from "@/components/FavoritesProvider";
import { HighlightProductProvider } from "@/components/HighlightProductContext";
import { BarHomeProvider } from "@/components/BarHomeContext";
import { AppWithSplash } from "@/components/AppWithSplash";
import { BonusScreenProvider } from "@/components/BonusScreenContext";
import { PromoBanner } from "@/components/PromoBanner";
import { DailyCacheVersionScript } from "@/components/DailyCacheVersionScript";
import { GastrobarGamesCardBgVersionStyle } from "@/components/GastrobarGamesCardBgVersionStyle";
import { ServiceWorkerCleanup } from "@/components/ServiceWorkerCleanup";
import { DevChunkLoadRecovery } from "@/components/DevChunkLoadRecovery";
import { I18nProvider } from "@/lib/useTranslation";
import { I18nDocumentTitle } from "@/components/I18nDocumentTitle";

const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#12121a" },
  ],
};

export const metadata: Metadata = {
  title: "GASTROBAR — Меню",
  description: "Меню гастробара. Бар, блюда и акции.",
  applicationName: "GASTROBAR",
  manifest: "/manifest.json",
  /**
   * Иконки вкладки и «Добавить на экран»: app/icon.png и app/apple-icon.png
   * (генерируются скриптом npm run icons / prebuild из menu/logo_gastrobar.png).
   */
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GASTROBAR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-FTR2SGKNGG"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-FTR2SGKNGG');
          `}
        </Script>
      </head>
      <body
        className={`${montserrat.className} app min-h-screen bg-black pb-28 pt-0 text-white`}
        style={{ backgroundColor: "#000", color: "#fff", minHeight: "100dvh" }}
      >
        <GastrobarGamesCardBgVersionStyle />
        <DailyCacheVersionScript />
        <ServiceWorkerCleanup />
        <DevChunkLoadRecovery />
        <I18nProvider>
          <I18nDocumentTitle />
          <ThemeProvider initialPeriod="bar">
            <FavoritesProvider>
              <HighlightProductProvider>
                <BarHomeProvider>
                  <AppWithSplash>
                    <BonusScreenProvider>
                      <div className="app min-h-[100dvh] min-h-[100svh]">{children}</div>
                      <PromoBanner />
                    </BonusScreenProvider>
                  </AppWithSplash>
                </BarHomeProvider>
              </HighlightProductProvider>
            </FavoritesProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
