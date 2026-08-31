import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Squishova WMS",
  description: "Lagerverwaltung für Squishova",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom bleibt erlaubt: das Sperren würde Mitarbeitenden mit eingeschränktem
  // Sehvermögen die Scanner-Oberfläche unbenutzbar machen.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
