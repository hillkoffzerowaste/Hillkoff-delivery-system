import { Kanit } from "next/font/google";
import "./globals.css";

const kanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-kanit",
  display: "swap"
});

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
  themeColor: "#173531",
  viewportFit: "cover"
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" className={kanit.variable}>
      <body>{children}</body>
    </html>
  );
}
