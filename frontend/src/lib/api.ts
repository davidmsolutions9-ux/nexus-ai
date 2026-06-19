const BASE = '/api/proxy'

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('nexus_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Error desconocido')
  return json.data
}

export const api = {
  auth: {
    register: (body: { email: string; password: string; planName: string; timezone: string }) =>
      request<{ id: string; email: string }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body: { email: string; password: string }) =>
      request<{ accessToken: string; userId: string }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    me: () => request<{ id: string; email: string; plan: { name: string; creditsPerDay: number } }>('/auth/me'),
  },
  credits: {
    balance: () => request<{ planCredits: number; rechargeCredits: number; total: number; nextExpiry: string | null }>('/credits/balance'),
    transactions: (page = 1) => request<Transaction[]>(`/credits/transactions?page=${page}`),
  },
  chat: {
    complete: (body: { prompt: string; sliderMode: string; maxTokens?: number; forceProvider?: string }) =>
      request<{ provider: string; model: string; tokensConsumed: number; acuCost: number; creditCost: number; responseText: string }>('/orchestrator/complete', { method: 'POST', body: JSON.stringify(body) }),
  },
  providers: {
    list: () => request<ProviderModel[]>('/providers'),
  },
}

export interface Transaction {
  id: string
  type: string
  creditAmount: string
  provider?: string
  modelUsed?: string
  createdAt: string
}

export interface ProviderModel {
  provider: string
  model: string
  effectiveAcuPer1kTokens: number
  qualityIndex: number
  latencyP95Ms: number
  status: string
}
