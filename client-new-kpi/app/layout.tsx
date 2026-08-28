import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/context/QueryProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Época KPI",
  description: "Inteligência financeira — rotinas gerenciais da Época",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: extensões de navegador (LanguageTool, Grammarly,
    // Dark Reader, tradutores) injetam atributos no <html> antes do React hidratar,
    // e a divergência quebra a hidratação com um erro que não vem do nosso código.
    // A supressão vale só para os atributos DESTE elemento — mismatch real dentro
    // da árvore continua sendo reportado normalmente.
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
