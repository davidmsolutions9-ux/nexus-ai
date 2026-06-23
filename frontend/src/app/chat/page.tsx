'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/store/auth'
import { api, type ConversationSummary } from '@/lib/api'

type SliderMode = 'ECONOMIC' | 'AUTO' | 'PRO'
type ForceProvider = 'auto' | 'groq' | 'openai' | 'anthropic' | 'google' | 'gemma' | 'mixtral'

// ─── Token / credit estimation ────────────────────────────────────────────────
const ACU_RATE: Record<SliderMode, number> = { ECONOMIC: 0.08, AUTO: 0.28, PRO: 2.8 }
const ACU_TO_CR = 100 / 75
const EST_OUTPUT: Record<SliderMode, number> = { ECONOMIC: 350, AUTO: 650, PRO: 1100 }

function estimateCr(inputText: string, hist: { content: string }[], mode: SliderMode): number {
  const inTok  = Math.ceil(inputText.length / 4)
  const hisTok = Math.ceil(hist.reduce((s, m) => s + m.content.length, 0) / 4)
  const total  = inTok + hisTok + EST_OUTPUT[mode]
  return (total / 1000) * ACU_RATE[mode] * ACU_TO_CR
}

// ─── Nexus voice ──────────────────────────────────────────────────────────────

let activeAbort: AbortController | null = null
let activeSpeechText: string | null = null
let activeSource: AudioBufferSourceNode | null = null
let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioCtx
}

function cleanForTTS(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*]\s/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000)
}

function stopCurrentAudio() {
  activeAbort?.abort()
  activeAbort = null
  if (activeSource) {
    try { activeSource.stop() } catch { /* already stopped */ }
    activeSource = null
  }
}

function speakWithBrowser(text: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    synth.cancel()
    const utt = new SpeechSynthesisUtterance(cleanForTTS(text))
    utt.lang = 'en-US'
    utt.rate = 1.0
    utt.pitch = 1.0
    const trySpeak = () => {
      const voices = synth.getVoices()
      const preferred = voices.find((v) => v.lang.startsWith('en') && v.localService) ?? voices.find((v) => v.lang.startsWith('en'))
      if (preferred) utt.voice = preferred
      utt.onend = () => resolve()
      utt.onerror = () => resolve()
      signal.addEventListener('abort', () => { synth.cancel(); resolve() }, { once: true })
      synth.speak(utt)
    }
    if (synth.getVoices().length > 0) {
      trySpeak()
    } else {
      synth.onvoiceschanged = () => trySpeak()
    }
  })
}

async function speakWithTTS(text: string, _token: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  if ('speechSynthesis' in window) {
    return speakWithBrowser(text, signal)
  }
}

// ─── Push notification subscription ──────────────────────────────────────────

const VAPID_PUBLIC = 'BPLs7z8PfsTFDWMyh5AWsmzTUoW2XGOZG4weT3lAVxsQzl3thFP7N1zK6UsqPz0QvvPPkQTQm-VH7i7Za363NWg'

async function subscribeToPush(token: string | null) {
  if (!token || !('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      })
    }
    const json = sub.toJSON()
    await fetch('/api/proxy/reminders/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    })
  } catch { /* push not supported or denied */ }
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr.buffer
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Message extends ChatMessage {
  provider?: string
  model?: string
  credits?: number
  sliderMode?: SliderMode
  error?: boolean
}

// ─── Slider config ────────────────────────────────────────────────────────────
const SLIDER_CONFIG: Record<SliderMode, {
  label: string
  creditCost: number
  systemPrompt: string
  badge: string
  upsell?: string
}> = {
  ECONOMIC: {
    label: 'Eco',
    creditCost: 0.5,
    systemPrompt: 'You are Nexus AI in Eco mode. ALWAYS respond in English regardless of the language the user writes in. Respond concisely and directly. The model running you is specified in the model system prompt — that is the only model you use. NEVER claim you have switched models.',
    badge: 'Eco',
  },
  AUTO: {
    label: 'Auto',
    creditCost: 1.2,
    systemPrompt: 'You are Nexus AI. ALWAYS respond in English regardless of the language the user writes in. The Nexus AI orchestrator selects the model based on the slider mode (Eco, Auto, Pro) and provider availability. The exact model running THIS response is specified in the model system prompt — that is the only model you are using now. If asked which model you are using, state exactly the one in the model system prompt. NEVER say you switched to a different model during the conversation.',
    badge: 'Auto',
  },
  PRO: {
    label: 'Pro',
    creditCost: 3.5,
    systemPrompt: 'You are Nexus AI in Pro mode. ALWAYS respond in English regardless of the language the user writes in. Provide complete, detailed, highest-quality responses. The model running you is specified in the model system prompt. NEVER claim you switched to another model during the conversation. If asked about the model, state exactly the one from the model system prompt.',
    badge: 'Pro',
    upsell: 'Claude Opus and GPT-4o available on Plus and Pro plans',
  },
}

const AI_OPTIONS: { id: ForceProvider; label: string; desc: string; dot: string; free?: boolean }[] = [
  { id: 'auto',      label: 'Auto',    desc: 'Nexus picks the best',         dot: 'bg-blue-400'    },
  { id: 'groq',      label: 'Llama',   desc: 'Groq · Llama 3.3 70B',        dot: 'bg-green-400',  free: true },
  { id: 'gemma',     label: 'Qwen',    desc: 'Groq · Qwen3 32B',             dot: 'bg-purple-400', free: true },
  { id: 'mixtral',   label: 'Scout',   desc: 'Groq · Llama 4 Scout 17B',    dot: 'bg-pink-400',   free: true },
  { id: 'openai',    label: 'ChatGPT', desc: 'OpenAI · GPT-4o',              dot: 'bg-emerald-400' },
  { id: 'anthropic', label: 'Claude',  desc: 'Anthropic · Sonnet',           dot: 'bg-orange-400'  },
  { id: 'google',    label: 'Gemini',  desc: 'Google · Gemini Pro',          dot: 'bg-sky-400'     },
]

function makeTitle(text: string) {
  const t = text.trim()
  return t.length > 40 ? t.slice(0, 40) + '…' : t
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

export default function ChatPage() {
  const router = useRouter()
  const { token, email, logout, _hasHydrated } = useAuth()

  const [messages, setMessages]           = useState<Message[]>([])
  const [history, setHistory]             = useState<ChatMessage[]>([])
  const [activeConvId, setActiveConvId]   = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loadingConvs, setLoadingConvs]   = useState(false)

  const [input, setInput]             = useState('')
  const [sliderMode, setSliderMode]   = useState<SliderMode>('AUTO')
  const [selectedAI, setSelectedAI]   = useState<ForceProvider>('auto')
  const [loading, setLoading]         = useState(false)
  const [memoryOn, setMemoryOn]       = useState(true)
  const [balance, setBalance]         = useState<number | null>(null)
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null)
  const [copiedIdx, setCopiedIdx]     = useState<number | null>(null)
  const [darkMode, setDarkMode]       = useState(true)
  const [convSearch, setConvSearch]   = useState('')
  const [listening, setListening]     = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [audioError, setAudioError]   = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('nexus_theme')
    if (saved === 'light') setDarkMode(false)
  }, [])

  useEffect(() => {
    localStorage.setItem('nexus_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen]   = useState(false)
  const [showAIMenu, setShowAIMenu]         = useState(false)
  const [notifications, setNotifications]   = useState<string[]>([])
  const [voiceMode, setVoiceMode]           = useState(false)
  const voiceModeRef    = useRef(false)
  const voiceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentRecRef   = useRef<any>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true)
    try {
      const list = await api.conversations.list()
      setConversations(list)
    } catch {
      // silently fail — sidebar stays empty
    } finally {
      setLoadingConvs(false)
    }
  }, [])

  useEffect(() => {
    if (!_hasHydrated) return
    if (!token) { router.push('/login'); return }
    api.credits.balance().then((b) => setBalance(b.total)).catch(() => {})
    api.memory.notifications().then((r) => { if (r.messages.length > 0) setNotifications(r.messages) }).catch(() => {})
    subscribeToPush(token)
    // Load conversations then restore session
    ;(async () => {
      try {
        const list = await api.conversations.list()
        setConversations(list)
        // Restore active conversation (1h session persistence)
        const raw = localStorage.getItem('nexus_active_conv')
        if (raw) {
          const { convId, timestamp } = JSON.parse(raw)
          if (Date.now() - timestamp < 3_600_000) {
            const conv = list.find((c: ConversationSummary) => c.id === convId)
            if (conv) openConversation(conv)
          }
        }
      } catch { /* ignore */ }
    })()
  }, [token, router, _hasHydrated, loadConversations])


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + 'px'
    }
  }, [input])

  async function openConversation(conv: ConversationSummary) {
    // Summarize current conversation before switching
    if (activeConvId && activeConvId !== conv.id && messages.length >= 2) {
      api.conversations.summarize(activeConvId).catch(() => {})
    }
    setDrawerOpen(false)
    setActiveConvId(conv.id)
    setMessages([])
    setHistory([])
    try {
      const msgs = await api.conversations.messages(conv.id)
      const display: Message[] = msgs.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sliderMode: m.sliderMode as SliderMode | undefined,
        provider: m.provider,
        model: m.model,
        credits: m.creditCost ? parseFloat(m.creditCost) : undefined,
      }))
      const hist: ChatMessage[] = msgs
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      setMessages(display)
      setHistory(hist)
    } catch {
      setMessages([{ role: 'assistant', content: 'Error loading messages', error: true }])
    }
  }

  async function startNewChat() {
    // Summarize current conversation before clearing (builds user memory profile)
    if (activeConvId && messages.length >= 2) {
      api.conversations.summarize(activeConvId).catch(() => {})
    }
    setMessages([])
    setHistory([])
    setActiveConvId(null)
    setSliderMode('AUTO')
    setDrawerOpen(false)
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || loading) return
    // Stop mic during send (voice mode: will reopen after response)
    if (currentRecRef.current) {
      try { currentRecRef.current.stop() } catch { /* ok */ }
      currentRecRef.current = null
    }

    const text = input.trim()
    const mode = sliderMode
    const cfg  = SLIDER_CONFIG[mode]

    const userMsg: Message = { role: 'user', content: text }
    const updatedMessages  = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    const newHistory: ChatMessage[] = [...history, { role: 'user', content: text }]

    try {
      // 1. Create conversation in DB if this is the first message
      let convId = activeConvId
      if (!convId) {
        const conv = await api.conversations.create(makeTitle(text))
        convId = conv.id
        setActiveConvId(convId)
        localStorage.setItem('nexus_active_conv', JSON.stringify({ convId, timestamp: Date.now() }))
      }

      // 2. Save user message to DB
      await api.conversations.addMessage(convId, { role: 'user', content: text, sliderMode: mode })

      // 3. Call AI
      const result = await api.chat.complete({
        prompt: text,
        sliderMode: mode,
        maxTokens: 1000,
        messages: newHistory,
        systemPrompt: cfg.systemPrompt,
        noMemory: !memoryOn,
        ...(selectedAI !== 'auto' ? { forceProvider: selectedAI } : {}),
      })

      const assistantContent = result.responseText ?? ''
      const assistantMsg: Message = {
        role: 'assistant',
        content: assistantContent,
        provider: result.provider,
        model: result.model,
        credits: result.creditCost,
        sliderMode: mode,
      }

      const finalMessages = [...updatedMessages, assistantMsg]
      const finalHistory: ChatMessage[] = [...newHistory, { role: 'assistant', content: assistantContent }]

      setMessages(finalMessages)
      setHistory(finalHistory)
      setBalance((prev) => prev !== null ? Math.max(0, prev - result.creditCost) : null)

      // 4. Save assistant message to DB
      await api.conversations.addMessage(convId, {
        role: 'assistant',
        content: assistantContent,
        sliderMode: mode,
        provider: result.provider,
        model: result.model,
        creditCost: result.creditCost,
      })

      // 5. Refresh sidebar + update session timestamp
      loadConversations()
      if (convId) localStorage.setItem('nexus_active_conv', JSON.stringify({ convId, timestamp: Date.now() }))

    } catch (err) {
      setMessages([...updatedMessages, {
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Error processing request',
        error: true,
        sliderMode: mode,
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const activeAI  = AI_OPTIONS.find((a) => a.id === selectedAI)!
  const activeCfg = SLIDER_CONFIG[sliderMode]

  const estimatedCr = input.trim() ? estimateCr(input, history, sliderMode) : null

  function clearSilenceTimer() {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
  }

  function openMicForVoiceMode(autoCloseAfter5s = false) {
    if (!voiceModeRef.current) return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true

    let capturedText = ''
    let hasSpeech = false

    const stopAndSend = () => {
      clearSilenceTimer()
      try { rec.stop() } catch { /* ok */ }
      // onend will fire and handle the send
    }

    rec.onstart = () => {
      setListening(true)
      // If autoCloseAfter5s and user says nothing, close mic after 5s
      if (autoCloseAfter5s) {
        silenceTimerRef.current = setTimeout(() => {
          if (!hasSpeech) {
            voiceModeRef.current = false
            setVoiceMode(false)
            try { rec.stop() } catch { /* ok */ }
          }
        }, 5000)
      }
    }

    rec.onresult = (e: any) => {
      hasSpeech = true
      clearSilenceTimer()
      let interim = ''
      capturedText = ''
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) capturedText += t + ' '
        else interim += t
      }
      setInput((capturedText + interim).trim())

      // Reset 5s silence timer on every new speech result
      silenceTimerRef.current = setTimeout(() => stopAndSend(), 5000)
    }

    rec.onend = () => {
      setListening(false)
      clearSilenceTimer()
      currentRecRef.current = null
      if (!voiceModeRef.current) return
      const text = capturedText.trim()
      if (text) {
        capturedText = ''
        setInput('')
        sendMessageFromVoice(text)
      }
      // If nothing captured and not autoClose → mic stays closed until next response
    }

    rec.onerror = (e: any) => {
      setListening(false)
      clearSilenceTimer()
      if (e.error === 'not-allowed') {
        setAudioError('Microphone access denied. Check browser permissions.')
        setTimeout(() => setAudioError(null), 5000)
        voiceModeRef.current = false
        setVoiceMode(false)
      } else if (e.error === 'no-speech') {
        // Browser no-speech event — treated as silence, onend will fire
      } else if (e.error !== 'aborted' && voiceModeRef.current) {
        setAudioError(`Mic error: ${e.error}`)
        setTimeout(() => setAudioError(null), 4000)
      }
    }

    if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current)
    currentRecRef.current = rec
    try { rec.start() } catch { setListening(false) }
  }

  function sendMessageFromVoice(text: string) {
    if (!text.trim() || !token) return
    setInput('')
    // Trigger send with the provided text
    const userMsg: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    const newHistory = [...history, { role: 'user' as const, content: text }]
    setHistory(newHistory)
    setLoading(true)

    const cfg = SLIDER_CONFIG[sliderMode]
    fetch('/api/proxy/orchestrator/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: text, sliderMode, forceProvider: selectedAI === 'auto' ? undefined : selectedAI, messages: newHistory.slice(-20), systemPrompt: cfg.systemPrompt, noMemory: !memoryOn }),
    })
      .then((r) => r.json())
      .then((data) => {
        const reply = data?.data?.responseText ?? 'Sin respuesta.'
        const aiMsg: Message = { role: 'assistant', content: reply, provider: data?.data?.provider, model: data?.data?.model }
        setMessages((prev) => [...prev, aiMsg])
        setHistory((prev) => [...prev, { role: 'assistant', content: reply }])
        // Auto-speak reply then reopen mic
        if (voiceModeRef.current && token) {
          const abort = new AbortController()
          activeAbort = abort
          speakWithTTS(reply, token, abort.signal).finally(() => {
            if (activeAbort === abort) activeAbort = null
            setSpeakingIdx(null)
            // Reopen mic for 5s — auto-closes if user says nothing
            if (voiceModeRef.current) openMicForVoiceMode(true)
          })
        }
      })
      .catch(() => {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error.', error: true }])
      })
      .finally(() => setLoading(false))
  }

  function toggleVoiceMode() {
    if (voiceMode) {
      voiceModeRef.current = false
      setVoiceMode(false)
      setListening(false)
      if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current)
      clearSilenceTimer()
      if (currentRecRef.current) { try { currentRecRef.current.stop() } catch { /* ok */ }; currentRecRef.current = null }
      stopCurrentAudio()
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setAudioError('Voice recognition not supported. Use Chrome or Safari.')
      setTimeout(() => setAudioError(null), 4000)
      return
    }
    const startVoice = () => { voiceModeRef.current = true; setVoiceMode(true); openMicForVoiceMode() }
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(startVoice)
        .catch((err) => {
          setAudioError(`Mic permission denied: ${err?.message ?? err}`)
          setTimeout(() => setAudioError(null), 5000)
        })
    } else {
      startVoice()
    }
  }

  function copyMsg(content: string, idx: number) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 1500)
    })
  }

  function speakMsg(content: string, idx: number) {
    // Stop if already playing this message
    if (speakingIdx === idx) {
      stopCurrentAudio()
      activeSpeechText = null
      setSpeakingIdx(null)
      return
    }

    // Stop any other audio first
    stopCurrentAudio()

    if (!token) return
    setSpeakingIdx(idx)
    activeSpeechText = content

    const abort = new AbortController()
    activeAbort = abort

    setAudioError(null)
    speakWithTTS(content, token, abort.signal)
      .catch((err) => {
        setAudioError(`Audio error: ${err?.message ?? 'failed'}`)
        setTimeout(() => setAudioError(null), 4000)
      })
      .finally(() => {
        if (activeAbort === abort) activeAbort = null
        setSpeakingIdx((cur) => cur === idx ? null : cur)
        activeSpeechText = null
      })
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  const filteredConvs = convSearch.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(convSearch.toLowerCase()))
    : conversations

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Header: logo + new chat */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5 px-1 mb-3">
          <XLogo size={18} />
          <span className="font-semibold tracking-wide text-sm text-white/90">
            Nexus <span className="text-blue-400">AI</span>
          </span>
        </div>
        <button
          onClick={startNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition border border-white/[0.06]"
        >
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          New chat
        </button>
      </div>

      {/* Search bar */}
      <div className="shrink-0 px-3 py-2">
        <div className="flex items-center gap-2 px-2.5 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gray-600 shrink-0">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={convSearch}
            onChange={(e) => setConvSearch(e.target.value)}
            placeholder="Search chats…"
            className="flex-1 bg-transparent text-xs outline-none" style={{color:'var(--nx-text)'}}
          />
          {convSearch && (
            <button onClick={() => setConvSearch('')} className="text-gray-600 hover:text-gray-400">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Conversations — max 50% height, scrollable */}
      <div className="shrink-0 overflow-y-auto px-3 py-1" style={{ maxHeight: '50%' }}>
        {loadingConvs && filteredConvs.length === 0 && (
          <p className="text-[11px] text-gray-700 px-2 mt-2">Loading…</p>
        )}
        {!loadingConvs && conversations.length === 0 && (
          <p className="text-[11px] text-gray-700 px-2 mt-2">Conversations will appear here</p>
        )}
        {!loadingConvs && conversations.length > 0 && filteredConvs.length === 0 && (
          <p className="text-[11px] text-gray-700 px-2 mt-2">No results</p>
        )}
        {filteredConvs.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-widest text-gray-600 px-2 mb-2">Recent</p>
            <div className="flex flex-col gap-0.5">
              {filteredConvs.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition ${
                    activeConvId === conv.id
                      ? 'bg-blue-600/20 text-white border-l-2 border-[#1A56DB]'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 opacity-40">
                      <path d="M1 1h10v7.5a.5.5 0 0 1-.5.5H5L2 11V9H1.5A.5.5 0 0 1 1 8.5V1z" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                    <span className="truncate text-xs">{conv.title}</span>
                  </div>
                  <div className="text-[10px] text-gray-700 pl-5 mt-0.5">{formatDate(conv.updatedAt)}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User info */}
      <div className="shrink-0 px-4 py-2.5 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full shrink-0 bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center border border-blue-400/30 text-white text-xs font-bold select-none">
            {email ? email[0].toUpperCase() : '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/70 truncate">{email}</div>
            <div className="text-[10px] text-blue-400/70">{balance !== null ? `${balance.toFixed(0)} cr` : '—'}</div>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-white/[0.06] px-3 py-2.5 flex items-center gap-1.5">
        {/* Dark/light mode toggle */}
        <button
          onClick={() => setDarkMode((v) => !v)}
          title={darkMode ? 'Modo claro' : 'Modo oscuro'}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs transition border ${
            darkMode
              ? 'border-white/[0.08] bg-white/[0.04] text-gray-300 hover:text-white hover:bg-white/[0.08]'
              : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20'
          }`}
        >
          {darkMode ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          )}
          <span>{darkMode ? 'Light' : 'Dark'}</span>
        </button>

        {/* Memory */}
        <Link
          href="/memory"
          title="Mi memoria"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs border border-white/[0.08] bg-white/[0.04] text-gray-400 hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-600/10 transition"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          <span>Memory</span>
        </Link>

        {/* Logout */}
        <button
          onClick={() => { logout(); router.push('/') }}
          title="Cerrar sesión"
          className="p-2 rounded-xl text-gray-600 hover:text-gray-300 hover:bg-white/[0.04] transition border border-transparent"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M5 2H2.5A.5.5 0 0 0 2 2.5v9a.5.5 0 0 0 .5.5H5M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden nx-bg nx-text" data-theme={darkMode ? 'dark' : 'light'} style={{background:'var(--nx-bg)',color:'var(--nx-text)'}}>

      {/* Desktop sidebar */}
      <aside className={`hidden md:flex flex-col shrink-0 border-r transition-all duration-200 ${sidebarOpen ? 'w-60' : 'w-0 overflow-hidden border-0'}`} style={{background:'var(--nx-sidebar)',borderColor:'var(--nx-border)',color:'var(--nx-text)'}}>
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute left-0 top-0 h-full w-64 border-r z-50" style={{background:'var(--nx-sidebar)',borderColor:'var(--nx-border)',color:'var(--nx-text)'}} onClick={(e) => e.stopPropagation()}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0" style={{background:'var(--nx-header)',borderColor:'var(--nx-border)',color:'var(--nx-text)'}}>
          <button
            onClick={() => { setSidebarOpen((v) => !v); setDrawerOpen((v) => !v) }}
            className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 17 17" fill="none">
              <path d="M2 4h13M2 8.5h13M2 13h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {!sidebarOpen && (
            <Link href="/" className="hidden md:flex items-center gap-2 shrink-0">
              <XLogo size={16} />
              <span className="text-sm font-semibold text-white/80">Nexus <span className="text-blue-400">AI</span></span>
            </Link>
          )}

          {/* AI selector */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowAIMenu((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-gray-300 hover:text-white hover:bg-white/5 transition border border-white/[0.06]"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeAI.dot}`} />
              <span>{activeAI.label}</span>
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="text-gray-600">
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
            {showAIMenu && (
              <div className="absolute top-full left-0 mt-1.5 w-52 bg-[#0d1420] border border-white/[0.08] rounded-xl shadow-xl z-20 overflow-hidden">
                <div className="px-3.5 py-2 border-b border-white/[0.06]">
                  <p className="text-[10px] text-gray-600">Model for next response</p>
                </div>
                {AI_OPTIONS.map((ai) => (
                  <button
                    key={ai.id}
                    onClick={() => { setSelectedAI(ai.id); setShowAIMenu(false) }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition ${selectedAI === ai.id ? 'bg-white/8 text-white' : 'text-gray-400 hover:text-white hover:bg-white/4'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ai.dot}`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium leading-none flex items-center gap-1.5">
                        {ai.label}
                        {ai.free && <span className="text-[9px] bg-green-500/20 text-green-400 px-1 py-0.5 rounded">free</span>}
                      </div>
                      <div className="text-[10px] text-gray-600 mt-0.5">{ai.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600/10 border border-blue-500/20 rounded-xl shrink-0">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="#3b82f6" strokeWidth="1.3" />
              <path d="M4 6h4M6 4v4" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className="text-xs font-semibold text-blue-300">
              {balance !== null ? `${balance.toFixed(0)} cr` : '—'}
            </span>
          </div>

          {/* Profile button */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowProfile((v) => !v)}
              className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center border border-blue-400/30 text-white text-xs font-bold"
              title={email ?? ''}
            >
              {email ? email[0].toUpperCase() : '?'}
            </button>
            {showProfile && (
              <div className="absolute top-full right-0 mt-2 w-64 rounded-2xl shadow-2xl border z-30 overflow-hidden" style={{background:'var(--nx-sidebar)',borderColor:'var(--nx-border)',color:'var(--nx-text)'}}>
                {/* User info */}
                <div className="px-4 py-3 border-b" style={{borderColor:'var(--nx-border)'}}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-bold">
                      {email ? email[0].toUpperCase() : '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/80 truncate">{email}</div>
                      <div className="text-[10px] text-blue-400">Free plan · {balance !== null ? `${balance.toFixed(0)} cr` : '—'}</div>
                    </div>
                  </div>
                </div>
                {/* Actions */}
                <div className="p-2 flex flex-col gap-0.5">
                  <button
                    onClick={() => { setShowProfile(false); window.location.href = '/memory' }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] transition text-left"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                    My memory
                  </button>
                  <div className="px-3 py-2 rounded-xl border border-white/[0.06] opacity-50 cursor-not-allowed">
                    <div className="flex items-center gap-2.5">
                      <svg width="13" height="13" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      <span className="text-xs text-gray-500">Continue with Google <span className="text-[10px] text-blue-500/60 ml-1">Coming soon</span></span>
                    </div>
                  </div>
                  <div className="my-1 border-t" style={{borderColor:'var(--nx-border)'}} />
                  <button
                    onClick={() => { setShowProfile(false); logout(); router.push('/') }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-red-400 hover:text-red-300 hover:bg-red-500/[0.08] transition text-left"
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M5 2H2.5A.5.5 0 0 0 2 2.5v9a.5.5 0 0 0 .5.5H5M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Audio error banner */}
        {audioError && (
          <div className="border-b border-red-500/20 bg-red-500/5 px-4 py-2 shrink-0">
            <div className="max-w-2xl mx-auto flex items-center gap-2">
              <span className="text-red-400 text-xs shrink-0">⚠</span>
              <p className="text-xs text-red-300/80 flex-1">{audioError}</p>
              <button onClick={() => setAudioError(null)} className="text-gray-600 hover:text-gray-400 shrink-0">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* Proactive notifications banner */}
        {notifications.length > 0 && (
          <div className="border-b border-yellow-500/20 bg-yellow-500/5 px-4 py-2.5 shrink-0">
            <div className="max-w-2xl mx-auto flex items-start gap-2">
              <span className="text-yellow-400 shrink-0 mt-0.5">🔔</span>
              <div className="flex-1">
                {notifications.map((n, i) => (
                  <p key={i} className="text-xs text-yellow-200/80">{n}</p>
                ))}
              </div>
              <button onClick={() => setNotifications([])} className="text-gray-600 hover:text-gray-400 shrink-0">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto relative">

          {/* Nebula background — only shown when chat is empty */}
          {messages.length === 0 && (
            <div className="nx-nebula-bg" aria-hidden="true"><span /></div>
          )}

          {messages.length === 0 ? (
            /* ── Empty state: avatar top, prompts bottom ── */
            <div className="relative z-10 flex flex-col h-full min-h-[calc(100vh-120px)]">
              {/* Avatar */}
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                <div
                  className="relative w-full max-w-xs sm:max-w-sm mx-auto"
                  style={{
                    maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/nexus-avatar2.png"
                    alt="Nexus AI"
                    style={{
                      width: '100%',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                </div>
              </div>

              {/* Bottom: greeting + suggestions */}
              <div className="shrink-0 px-4 pb-4 text-center select-none">
                <h2 className="text-lg font-light mb-4" style={{color:'var(--nx-text)'}}>How can I help you?</h2>
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm mx-auto">
                  {['Write a professional email', 'Explain how AI works', 'Summarize this text', 'Create a business plan'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setInput(p)}
                      className="px-3 py-2.5 text-left text-xs rounded-xl transition"
                      style={{color:'var(--nx-text-sub)',border:'1px solid var(--nx-border)',background:'var(--nx-bubble-ai)'}}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
          <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-8 flex flex-col gap-4 sm:gap-6">

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-[#1A56DB]/20 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <XLogo size={12} />
                  </div>
                )}
                <div className="max-w-[85%] sm:max-w-[78%] flex flex-col gap-1">
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#1A56DB] text-white rounded-br-sm'
                      : msg.error
                        ? 'bg-red-950/40 border border-red-900/40 text-red-400 rounded-bl-sm'
                        : 'rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>

                  {msg.role === 'assistant' && !msg.error && (
                    <div className="flex flex-col gap-1 px-1">
                      {msg.sliderMode && (
                        <span className="text-[10px] text-gray-600">
                          {msg.sliderMode === 'ECONOMIC' ? '💚' : msg.sliderMode === 'AUTO' ? '⚡' : '💎'}
                          {' '}
                          {msg.provider && msg.model
                            ? `${msg.provider} · ${msg.model}`
                            : SLIDER_CONFIG[msg.sliderMode].label}
                          {msg.credits !== undefined && ` · ${msg.credits.toFixed(3)} cr`}
                        </span>
                      )}
                      {/* Action buttons */}
                      <div className="flex items-center gap-1">
                        {/* Copy */}
                        <button
                          onClick={() => copyMsg(msg.content, i)}
                          title="Copiar"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-gray-600 hover:text-gray-300 hover:bg-white/[0.04] transition"
                        >
                          {copiedIdx === i ? (
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 6l3 3 5-6" stroke="#4ade80" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M3 3V2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9" stroke="currentColor" strokeWidth="1.2"/></svg>
                          )}
                          {copiedIdx === i ? 'Copied' : 'Copy'}
                        </button>
                        {/* Speak */}
                        <button
                          onClick={() => speakMsg(msg.content, i)}
                          title={speakingIdx === i ? 'Stop' : 'Listen'}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition ${speakingIdx === i ? 'text-blue-400 bg-blue-500/10' : 'text-gray-600 hover:text-gray-300 hover:bg-white/[0.04]'}`}
                        >
                          {speakingIdx === i ? (
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1.5" y="1.5" width="3" height="8" rx="0.5" fill="currentColor"/><rect x="6.5" y="1.5" width="3" height="8" rx="0.5" fill="currentColor"/></svg>
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 4H4.5L7 2v7L4.5 7H2V4z" stroke="currentColor" strokeWidth="1.1"/><path d="M8.5 3.5a2.5 2.5 0 0 1 0 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                          )}
                          {speakingIdx === i ? 'Stop' : 'Listen'}
                        </button>
                        {/* Timestamp */}
                        <span className="text-[10px] text-gray-700 ml-auto">
                          {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full shrink-0 mt-0.5 bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center border border-blue-400/30 text-white text-xs font-bold select-none">
                    {email ? email[0].toUpperCase() : '?'}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-[#1A56DB]/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <XLogo size={12} />
                </div>
                <div className="px-4 py-3 bg-[#1d2535] rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1.5 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-blue-500/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-blue-500/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-blue-500/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t px-3 pb-safe pt-2 shrink-0" style={{background:'var(--nx-header)',borderColor:'var(--nx-border)',paddingBottom:'max(12px, env(safe-area-inset-bottom))'}}>
          <div className="max-w-2xl mx-auto flex flex-col gap-1.5">

            <div className="flex items-end gap-2 border focus-within:border-blue-500/40 rounded-2xl px-3 py-2.5 transition" style={{background:'var(--nx-input)',borderColor:'var(--nx-border)'}}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={loading}
                rows={1}
                className="flex-1 bg-transparent text-sm resize-none focus:outline-none leading-relaxed disabled:opacity-50"
                style={{ maxHeight: '120px', overflowY: 'auto', color: 'var(--nx-text)' }}
              />
              {/* Microphone — voice conversation mode */}
              <button
                onClick={toggleVoiceMode}
                disabled={loading}
                title={voiceMode ? 'Exit voice mode' : 'Voice conversation'}
                className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition ${voiceMode ? 'bg-blue-600 text-white animate-pulse' : listening ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
              {/* Send */}
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition disabled:opacity-20"
                style={{ background: input.trim() ? 'linear-gradient(135deg,#1a48cc,#2a88ff)' : 'var(--nx-bubble-ai,#2a3347)' }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M12 1L5.5 7.5M12 1L8.5 12 5.5 7.5 1 4.5l11-3.5z" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between px-0.5">
              {/* Slider mode */}
              <div className="flex items-center gap-0.5 bg-[#0d1420] border border-white/[0.06] rounded-xl p-1">
                {(['ECONOMIC', 'AUTO', 'PRO'] as SliderMode[]).map((mode) => {
                  const cfg = SLIDER_CONFIG[mode]
                  return (
                    <button
                      key={mode}
                      onClick={() => setSliderMode(mode)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        sliderMode === mode
                          ? 'bg-[#1A56DB] text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Memory toggle */}
                <button
                  onClick={() => setMemoryOn((v) => !v)}
                  title={memoryOn ? 'Memoria activada' : 'Memoria desactivada'}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition border ${
                    memoryOn
                      ? 'border-blue-500/30 bg-blue-600/10 text-blue-400'
                      : 'border-white/[0.06] bg-transparent text-gray-600'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                  </svg>
                  <span className="hidden sm:inline">{memoryOn ? 'Memory' : 'No mem.'}</span>
                </button>

                {estimatedCr !== null && (
                  <span className={`text-[11px] font-medium tabular-nums ${balance !== null && estimatedCr > balance ? 'text-red-400' : 'text-gray-500'}`}>
                    ~{estimatedCr.toFixed(2)} cr
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAIMenu   && <div className="fixed inset-0 z-10"  onClick={() => setShowAIMenu(false)} />}
      {showProfile  && <div className="fixed inset-0 z-20"  onClick={() => setShowProfile(false)} />}
    </div>
  )
}

function XLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  const pad = Math.round(size * 0.08)
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        background: '#06101f',
        flexShrink: 0,
        overflow: 'hidden',
        padding: pad,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-nexus.png" alt="Nexus" width={size - pad * 2} height={size - pad * 2} style={{ display: 'block', objectFit: 'contain' }} />
    </span>
  )
}
