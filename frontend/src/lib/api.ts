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
    complete: (body: {
      prompt: string
      sliderMode: string
      maxTokens?: number
      forceProvider?: string
      messages?: { role: 'user' | 'assistant'; content: string }[]
      systemPrompt?: string
      noMemory?: boolean
    }) =>
      request<{ provider: string; model: string; tokensConsumed: number; acuCost: number; creditCost: number; responseText: string }>('/orchestrator/complete', { method: 'POST', body: JSON.stringify(body) }),
  },
  providers: {
    list: () => request<ProviderModel[]>('/providers'),
  },
  memory: {
    notifications: () => request<{ messages: string[] }>('/memory/notifications'),
    profile: () => request<{ facts: unknown[]; relationships: unknown[] }>('/memory/profile'),
    deleteFact: (id: string) => request<{ deleted: boolean }>(`/memory/facts/${id}`, { method: 'DELETE' }),
    deleteRelationship: (id: string) => request<{ deleted: boolean }>(`/memory/relationships/${id}`, { method: 'DELETE' }),
  },
  conversations: {
    list: () => request<ConversationSummary[]>('/conversations'),
    create: (title: string) =>
      request<{ id: string; title: string; createdAt: string }>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    messages: (id: string) => request<ConversationMessageRecord[]>(`/conversations/${id}/messages`),
    addMessage: (id: string, body: {
      role: 'user' | 'assistant'
      content: string
      sliderMode?: string
      provider?: string
      model?: string
      creditCost?: number
    }) => request<ConversationMessageRecord>(`/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    delete: (id: string) => request<{ deleted: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),
    summarize: (id: string) => request<{ summarized?: boolean; skipped?: boolean }>(`/conversations/${id}/summarize`, { method: 'POST' }),
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

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: { role: string; content: string }[]
}

export interface ConversationMessageRecord {
  id: string
  conversationId: string
  role: string
  content: string
  sliderMode?: string
  provider?: string
  model?: string
  creditCost?: string
  createdAt: string
}
