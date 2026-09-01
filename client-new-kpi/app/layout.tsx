import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/context/QueryProvider";
import { LeituraProvider, SCRIPT_LEITURA_INICIAL } from "@/context/LeituraProvider";
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
      <head>
        {/* Roda antes da primeira pintura. Sem ele a página nasceria no modo
            padrão e saltaria para o ampliado na hidratação — um pulo de tamanho
            de fonte justamente para quem precisa de fonte grande. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_LEITURA_INICIAL }} />
      </head>
      <body className="min-h-full">
        <LeituraProvider>
          <QueryProvider>{children}</QueryProvider>
        </LeituraProvider>
      </body>
    </html>
  );
}
