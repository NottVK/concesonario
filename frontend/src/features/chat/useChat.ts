import { useCallback, useEffect, useRef, useState } from 'react'
import { classifyChatError, deleteChatSession, sendChatMessage } from './chatApi'
import type { ChatFailure, ProposalData, VehicleCardData } from './chatApi'
import { clearChatToken } from './chatSession'
import { MAX_MESSAGE } from './chatApi'

export type ProposalState = 'open' | 'cancelled' | 'done'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'note'
  text: string
  cards?: VehicleCardData[]
  proposal?: ProposalData
  proposalState?: ProposalState
}

/** A los 10 s sin respuesta se avisa que el asistente sigue trabajando. */
export const THINKING_AFTER_MS = 10_000

interface Failure extends ChatFailure {
  /** Mensaje que se puede reenviar con «Reintentar» (no aplica a límites ni a mensajes inválidos). */
  retryText: string | null
}

/**
 * Estado de la conversación. Los mensajes viven SOLO en memoria (el navegador no los guarda); lo único que
 * persiste en la pestaña es el token de sesión que emite el servidor.
 */
export function useChat(vehicleId: number | null, thinkingAfterMs = THINKING_AFTER_MS) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [thinkingLong, setThinkingLong] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const nextId = useRef(1)
  const mounted = useRef(true)
  const busy = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Cuenta regresiva del límite (429): mientras dura, el campo queda deshabilitado.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown > 0]) // eslint-disable-line -- solo importa si hay cuenta activa, no cada segundo

  const append = useCallback((message: Omit<ChatMessage, 'id'>) => {
    setMessages((current) => [...current, { ...message, id: nextId.current++ }])
  }, [])

  const send = useCallback(
    async (raw: string, options: { resend?: boolean } = {}) => {
      const text = raw.trim()
      if (!text || text.length > MAX_MESSAGE || busy.current || cooldown > 0) return
      busy.current = true
      if (!options.resend) append({ role: 'user', text })
      setFailure(null)
      setSending(true)
      setThinkingLong(false)
      const thinking = setTimeout(() => mounted.current && setThinkingLong(true), thinkingAfterMs)
      try {
        const reply = await sendChatMessage(text, vehicleId)
        if (!mounted.current) return
        append({
          role: 'assistant',
          text: reply.reply,
          cards: reply.cards,
          ...(reply.proposal ? { proposal: reply.proposal, proposalState: 'open' as const } : {}),
        })
      } catch (error) {
        if (!mounted.current) return
        const classified = classifyChatError(error)
        const retryable = classified.kind !== 'rate-limit' && classified.kind !== 'invalid'
        setFailure({ ...classified, retryText: retryable ? text : null })
        if (classified.kind === 'rate-limit') setCooldown(classified.retryAfter ?? 30)
      } finally {
        clearTimeout(thinking)
        busy.current = false
        if (mounted.current) {
          setSending(false)
          setThinkingLong(false)
        }
      }
    },
    [append, cooldown, vehicleId, thinkingAfterMs],
  )

  const retry = useCallback(() => {
    if (failure?.retryText) void send(failure.retryText, { resend: true })
  }, [failure, send])

  /** Nueva conversación: el navegador olvida la sesión (el servidor la purga solo a los 7 días). */
  const reset = useCallback(() => {
    clearChatToken()
    setMessages([])
    setFailure(null)
    setCooldown(0)
  }, [])

  /** Borrar conversación: el servidor elimina la sesión y todo su historial. */
  const erase = useCallback(async () => {
    try {
      await deleteChatSession()
    } catch {
      // Si el servidor no responde, igual se olvida la sesión en el navegador y se avisa.
      clearChatToken()
      append({ role: 'note', text: 'No pudimos confirmar el borrado en el servidor. Lo intentaremos de nuevo si vuelves a escribir.' })
      return
    }
    setMessages([])
    setFailure(null)
    setCooldown(0)
  }, [append])

  const setProposalState = useCallback((id: number, state: ProposalState) => {
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, proposalState: state } : m)))
  }, [])

  return { messages, sending, thinkingLong, failure, cooldown, send, retry, reset, erase, append, setProposalState }
}
