import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/context/QueryProvider";
import { LeituraProvider, SCRIPT_LEITURA_INICIAL } from "@/context/LeituraProvider";
import { TemaProvider, SCRIPT_TEMA_INICIAL } from "@/context/TemaProvider";
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
  title: "Época Analytics",
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
        {/* Rodam antes da primeira pintura. Sem eles a página nasceria no modo
            padrão e escura, e saltaria na hidratação — um pulo de tamanho de fonte
            justamente para quem precisa de fonte grande, e um flash branco para
            quem escolheu o tema escuro. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_LEITURA_INICIAL }} />
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body className="min-h-full">
        <TemaProvider>
          <LeituraProvider>
            <QueryProvider>{children}</QueryProvider>
          </LeituraProvider>
        </TemaProvider>
      </body>
    </html>
  );
}
