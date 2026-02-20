import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  fallback: ["monospace"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["200", "300", "400", "500", "600", "700", "800"],
  display: "swap",
  fallback: ["system-ui", "arial"],
  adjustFontFallback: true, // Ensure consistent sizing between fallback and loaded font
  preload: true, // Preload font to prevent layout shifts
});

export const metadata: Metadata = {
  title: "Collabry - Collaborative Whiteboard",
  description: "Real-time collaborative whiteboard with bulletproof multiplayer",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ fontSize: '16px' }}>
      <head>
        <meta name="theme-color" content="#ffffff" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Detect and log zoom level for debugging
              (function() {
                const devicePixelRatio = window.devicePixelRatio || 1;
                const zoomLevel = Math.round(devicePixelRatio * 100);
                console.log('Browser zoom level:', zoomLevel + '%');
                console.log('Device pixel ratio:', devicePixelRatio);
                console.log('Window.innerWidth:', window.innerWidth);
                console.log('Document.documentElement.clientWidth:', document.documentElement.clientWidth);
                
                // Force normalize zoom by resetting the viewport
                const metaViewport = document.querySelector('meta[name="viewport"]');
                if (metaViewport) {
                  metaViewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
                }
                
                // Add a visual indicator in development
                if (zoomLevel !== 100) {
                  console.warn('⚠️ Browser zoom is not 100%. This may cause visual inconsistencies.');
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${manrope.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
