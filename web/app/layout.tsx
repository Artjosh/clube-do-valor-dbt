import type { Metadata } from "next";
import "./globals.css";

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
