import type { Metadata } from "next";
import "./globals.css";

// Auth pages and redirects must never become public prerendered responses.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clube do Valor | Observatório de dados",
  description: "Transações, carteiras e evidências de qualidade do dataset técnico Clube do Valor.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
