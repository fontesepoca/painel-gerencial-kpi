/**
 * Contrato de resposta da API. Espelha ApiResponse<T> do back-end
 * (api-new-kpi/Application/Common/ApiResponse.cs) — se um dos dois mudar,
 * o outro tem que mudar junto.
 */
export interface ApiResponse<T> {
  sucesso: boolean;
  dados: T | null;
  mensagem: string | null;
  erros: string[] | null;
}

/** Página de resultados. Espelha PagedResult<T> do back-end. */
export interface PagedResult<T> {
  itens: T[];
  pagina: number;
  tamanhoPagina: number;
  totalItens: number;
  totalPaginas: number;
  temAnterior: boolean;
  temProxima: boolean;
}

/** Resposta de GET /api/health. */
export interface HealthResponse {
  status: string;
  ambiente: string;
  oracleConfigurado: boolean;
  modulos: string[];
  verificadoEm: string;
}
