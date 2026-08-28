import { redirect } from "next/navigation";

/**
 * Não há login no piloto: a raiz cai direto na rotina DRE Gerencial.
 * Quando houver mais rotinas, esta página vira o índice delas.
 */
export default function Home() {
  redirect("/dre-gerencial");
}
