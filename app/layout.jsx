import "@fontsource/kanit/300.css";
import "@fontsource/kanit/400.css";
import "@fontsource/kanit/500.css";
import "@fontsource/kanit/600.css";
import "@fontsource/kanit/700.css";
import "@fontsource/kanit/800.css";
import "@fontsource/kanit/900.css";
import "./globals.css";

export const metadata = {
  title: "Hillkoff Delivery System",
  description: "Chiang Mai dispatch and delivery operations dashboard",
  manifest: "/manifest.webmanifest",
  applicationName: "Hillkoff Delivery",
  appleWebApp: {
    capable: true,
    title: "Hillkoff Delivery",
    statusBarStyle: "black-translucent"
  },
  icons: {
    icon: [
      { url: "/delivery-logo.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport = {
  themeColor: "#173534",
  viewportFit: "cover"
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
