export type LLMProvider = 'openai' | 'openai_compatible' | 'yandexgpt' | 'gigachat'
export type LLMConnectionStatus = 'pending' | 'verified' | 'failed' | 'disabled'

export type LLMConnectionSummary = {
  id: string
  provider: LLMProvider
  settings: Record<string, string>
  default_model: string
  status: LLMConnectionStatus
  last_tested_at: string | null
  created_at: string
  updated_at: string
}

export type LLMConnectionInput = {
  provider: LLMProvider
  settings: Record<string, string>
  credentials: Record<string, string>
  default_model: string
}

export type LLMConnectionTestResult = {
  id: string
  provider: LLMProvider
  model: string
  ok: boolean
  status: 'verified' | 'failed'
  error_category: string | null
  tested_at: string
}

export class LLMApiError extends Error {
  constructor(readonly status: number) {
    super(`LLM API request failed (${status})`)
    this.name = 'LLMApiError'
  }
}

export interface LLMConnectionService {
  list(): Promise<LLMConnectionSummary[]>
  create(input: LLMConnectionInput): Promise<LLMConnectionSummary>
  testConnection(id: string): Promise<LLMConnectionTestResult>
}

export function createLLMConnectionApi(baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'): LLMConnectionService {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
    if (!response.ok) throw new LLMApiError(response.status)
    return response.json() as Promise<T>
  }

  return {
    list: () => request<LLMConnectionSummary[]>('/llm-connections', { method: 'GET' }),
    create: (input) => request<LLMConnectionSummary>('/llm-connections', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    testConnection: (id) => request<LLMConnectionTestResult>(`/llm-connections/${encodeURIComponent(id)}/test`, {
      method: 'POST',
    }),
  }
}
