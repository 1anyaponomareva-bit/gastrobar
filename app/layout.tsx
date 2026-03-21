import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FavoritesProvider } from "@/components/FavoritesProvider";
import { HighlightProductProvider } from "@/components/HighlightProductContext";
import { BarHomeProvider } from "@/components/BarHomeContext";
import { AppWithSplash } from "@/components/AppWithSplash";
import { PromoBanner } from "@/components/PromoBanner";
import { BonusScreenProvider } from "@/components/BonusScreenContext";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#12121a" },
  ],
};

export const metadata: Metadata = {
  title: "GASTROBAR — Меню",
  description: "Меню гастробара. Бар, блюда и акции.",
  manifest: "/manifest.json",
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
      <body
        className={`${montserrat.className} min-h-screen bg-black pb-28 pt-0 text-white`}
        style={{ backgroundColor: "#000", color: "#fff", minHeight: "100dvh" }}
      >
        <ThemeProvider initialPeriod="bar">
          <FavoritesProvider>
            <HighlightProductProvider>
              <BarHomeProvider>
                <AppWithSplash>
                  <BonusScreenProvider>
                    <div className="min-h-[100dvh]">{children}</div>
                  </BonusScreenProvider>
                <PromoBanner />
                </AppWithSplash>
              </BarHomeProvider>
            </HighlightProductProvider>
          </FavoritesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
