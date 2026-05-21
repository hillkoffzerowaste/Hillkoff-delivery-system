import "./globals.css";

export const metadata = {
  title: "Hillkoff Delivery System",
  description: "Chiang Mai dispatch and delivery operations dashboard"
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
