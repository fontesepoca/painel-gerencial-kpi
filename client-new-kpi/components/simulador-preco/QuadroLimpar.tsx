"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * O quadro "Limpar simulações" (spec 2026-11-23-simulador-salvar-limpar).
 *
 * Dois passos no mesmo `<dialog>`: primeiro a pessoa marca o que quer limpar; depois confirma,
 * porque apagar do navegador não tem volta. Limpa de TODAS as filiais, regiões e fornecedores
 * deste usuário nesta base — a chave do localStorage já é por base e matrícula.
 *
 * `<dialog>` com `showModal`, como o `QuadroSimulacao`: o navegador prende o foco e cuida do Esc.
 */

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]";
const BOTAO_NEUTRO =
  "h-[var(--altura-controle)] rounded-[var(--radius-md)] border border-[var(--border-strong)] px-4 text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]";

export interface OpcoesDeLimpeza {
  edicoes: boolean;
  novos: boolean;
}

export function QuadroLimpar({
  temEdicoes,
  temNovos,
  onLimpar,
  onFechar,
}: {
  temEdicoes: boolean;
  temNovos: boolean;
  onLimpar: (o: OpcoesDeLimpeza) => void;
  onFechar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  // Começam marcados os que têm algo a limpar; o que está vazio nem pode ser marcado.
  const [edicoes, setEdicoes] = useState(temEdicoes);
  const [novos, setNovos] = useState(temNovos);
  const [confirmando, setConfirmando] = useState(false);

  const voltar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    dialogo.current?.showModal();
  }, []);

  // No passo da confirmação o foco vai para o "Voltar" (revisão de 24/11/2026). As `key` dos
  // botões fazem o React criar nós NOVOS ao trocar de passo: sem elas, o botão "Limpar" virava o
  // "Sim, limpar" no mesmo lugar e com o foco, e um segundo Enter (ou um duplo clique) apagava
  // tudo sem a pessoa ler a pergunta.
  //
  // O MOUSE pede mais: o "Sim, limpar" nasce no mesmo lugar do "Limpar", e o segundo clique de um
  // duplo clique cairia nele. Por isso ele só aceita clique depois de um instante.
  const [podeConfirmar, setPodeConfirmar] = useState(false);
  useEffect(() => {
    if (!confirmando) return;
    voltar.current?.focus();
    const t = window.setTimeout(() => setPodeConfirmar(true), 600);
    return () => window.clearTimeout(t);
  }, [confirmando]);

  const algumMarcado = edicoes || novos;
  const oQue = [edicoes && "as edições dos produtos da consulta", novos && "os produtos novos simulados"]
    .filter(Boolean)
    .join(" e ");

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        onFechar();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-xl)] border border-[var(--border-strong)] bg-[var(--surface-1)] p-0 text-[var(--text-primary)] shadow-[var(--shadow-modal)] backdrop:bg-black/50"
    >
      <header className="border-b border-[var(--border)] px-5 py-4">
        <h2 id={idTitulo} className="text-[length:var(--fs-base)] font-semibold">
          Limpar simulações
        </h2>
      </header>

      {!confirmando ? (
        <div className="flex flex-col gap-3 px-5 py-4 text-[length:var(--fs-base)]">
          <p className="text-[var(--text-secondary)]">Marque o que deseja apagar deste navegador:</p>
          <Opcao
            marcado={edicoes}
            desabilitado={!temEdicoes}
            onMudar={setEdicoes}
            texto="Edições dos produtos da consulta"
            apoio="De todas as filiais, regiões e fornecedores, inclusive as ainda não salvas."
          />
          <Opcao
            marcado={novos}
            desabilitado={!temNovos}
            onMudar={setNovos}
            texto="Produtos novos simulados"
          />
        </div>
      ) : (
        <div className="px-5 py-4 text-[length:var(--fs-base)]">
          <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--negative)] bg-[var(--negative-glow)] px-3 py-2 text-[var(--text-primary)]">
            Tem certeza? Isto apaga {oQue} deste navegador e <b>não dá para desfazer</b>.
          </p>
        </div>
      )}

      <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        {!confirmando ? (
          <>
            <button key="cancelar" type="button" onClick={onFechar} className={cn(FOCO, BOTAO_NEUTRO)}>
              Cancelar
            </button>
            <button
              key="limpar"
              type="button"
              disabled={!algumMarcado}
              onClick={() => setConfirmando(true)}
              className={cn(
                FOCO,
                "h-[var(--altura-controle)] rounded-[var(--radius-md)] border px-5 font-medium",
                algumMarcado
                  ? "border-[var(--negative)] text-[var(--negative)] hover:bg-[var(--negative-glow)]"
                  : "cursor-not-allowed border-[var(--border)] text-[var(--text-muted)]",
              )}
            >
              Limpar
            </button>
          </>
        ) : (
          <>
            <button
              key="voltar"
              ref={voltar}
              type="button"
              onClick={() => {
                setConfirmando(false);
                setPodeConfirmar(false);
              }}
              className={cn(FOCO, BOTAO_NEUTRO)}
            >
              Voltar
            </button>
            <button
              key="sim"
              type="button"
              disabled={!podeConfirmar}
              onClick={() => onLimpar({ edicoes, novos })}
              className={cn(FOCO, "h-[var(--altura-controle)] rounded-[var(--radius-md)] bg-[var(--negative)] px-5 font-medium text-[var(--sobre-negative)] hover:brightness-110 disabled:cursor-wait disabled:opacity-60")}
            >
              Sim, limpar
            </button>
          </>
        )}
      </footer>
    </dialog>
  );
}

function Opcao({
  marcado,
  desabilitado,
  onMudar,
  texto,
  apoio,
}: {
  marcado: boolean;
  desabilitado: boolean;
  onMudar: (v: boolean) => void;
  texto: string;
  apoio?: string;
}) {
  return (
    <label className={cn("flex items-start gap-3", desabilitado ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
      <input
        type="checkbox"
        checked={marcado && !desabilitado}
        disabled={desabilitado}
        onChange={(e) => onMudar(e.target.checked)}
        className="mt-1 size-4 accent-[var(--primary)]"
      />
      <span>
        <span className="font-medium">{texto}</span>
        {desabilitado && <span className="text-[var(--text-muted)]"> — nada guardado</span>}
        {apoio && !desabilitado && (
          <span className="block text-[length:var(--fs-apoio)] text-[var(--text-muted)]">{apoio}</span>
        )}
      </span>
    </label>
  );
}
