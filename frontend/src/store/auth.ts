'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  userId: string | null
  email: string | null
  planName: string | null
  _hasHydrated: boolean
  setAuth: (token: string, userId: string, email: string) => void
  setPlan: (planName: string) => void
  logout: () => void
  setHasHydrated: (v: boolean) => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      email: null,
      planName: null,
      _hasHydrated: false,
      setAuth: (token, userId, email) => {
        localStorage.setItem('nexus_token', token)
        set({ token, userId, email, _hasHydrated: true })
      },
      setPlan: (planName) => set({ planName }),
      logout: () => {
        localStorage.removeItem('nexus_token')
        set({ token: null, userId: null, email: null, planName: null })
      },
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'nexus-auth',
      partialize: (s) => ({ token: s.token, userId: s.userId, email: s.email, planName: s.planName }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
