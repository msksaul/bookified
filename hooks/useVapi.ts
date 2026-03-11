import { endVoiceSession, startVoiceSession } from '@/lib/actions/session.actions'
import { ASSISTANT_ID, DEFAULT_VOICE, VOICE_SETTINGS } from '@/lib/constants'
import { getVoice } from '@/lib/utils'
import { IBook, Messages } from '@/types'
import { useAuth } from '@clerk/nextjs'
import Vapi from '@vapi-ai/web'
import { useCallback, useEffect, useRef, useState } from 'react'

export type CallStatus =
  | 'idle'
  | 'connecting'
  | 'starting'
  | 'listening'
  | 'thinking'
  | 'speaking'

const VAPI_API_KEY = process.env.NEXT_PUBLIC_VAPI_API_KEY!
export const MAX_DURATION = 3 * 60
const TICK = 1000

let vapiInstance: InstanceType<typeof Vapi> | null = null

function getVapi() {
  if (!vapiInstance) {
    vapiInstance = new Vapi(VAPI_API_KEY)
  }
  return vapiInstance
}

const useVapi = (book: IBook) => {
  const { userId } = useAuth()

  const [status, setStatus] = useState<CallStatus>('idle')
  const [messages, setMessages] = useState<Messages[]>([])
  const [currentMessage, setCurrentMessage] = useState('')
  const [currentUserMessage, setCurrentUserMessage] = useState('')
  const [duration, setDuration] = useState(0)
  const [limitError, setLimitError] = useState<string | null>(null)

  const sessionIdRef = useRef<string | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const stoppingRef = useRef(false)

  const voice = book.persona || DEFAULT_VOICE

  const isActive =
    status === 'starting' ||
    status === 'listening' ||
    status === 'thinking' ||
    status === 'speaking'
  
  const stop = useCallback(() => {
    stoppingRef.current = true
    getVapi().stop()
  }, [])

  /* ----------------------------- TIMER ----------------------------- */

  const startTimer = () => {
    startTimeRef.current = Date.now()

    timerRef.current = setInterval(() => {
      if (!startTimeRef.current) return

      const d = Math.floor((Date.now() - startTimeRef.current) / 1000)
      setDuration(d)

      if (d >= MAX_DURATION) {
        stop()
        setLimitError('Session limit reached')
      }
    }, TICK)
  }

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  /* --------------------------- VAPI EVENTS -------------------------- */

  useEffect(() => {
    const vapi = getVapi()

    const onCallStart = () => {
      stoppingRef.current = false
      setStatus('starting')
      startTimer()
    }

    const onCallEnd = () => {
      setStatus('idle')
      setCurrentMessage('')
      setCurrentUserMessage('')

      stopTimer()

      if (sessionIdRef.current) {
        endVoiceSession(sessionIdRef.current, duration)
        sessionIdRef.current = null
      }

      startTimeRef.current = null
    }

    const onSpeechStart = () => {
      if (!stoppingRef.current) setStatus('speaking')
    }

    const onSpeechEnd = () => {
      if (!stoppingRef.current) setStatus('listening')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMessage = (message: any) => {
      if (message.type !== 'transcript') return

      if (message.role === 'user' && message.transcriptType === 'partial') {
        setCurrentUserMessage(message.transcript)
        return
      }

      if (message.role === 'assistant' && message.transcriptType === 'partial') {
        setCurrentMessage(message.transcript)
        return
      }

      if (message.transcriptType === 'final') {
        setCurrentMessage('')
        setCurrentUserMessage('')

        setMessages(prev => {
          const exists = prev.some(
            m => m.role === message.role && m.content === message.transcript
          )
          if (exists) return prev

          return [...prev, { role: message.role, content: message.transcript }]
        })

        if (message.role === 'user') setStatus('thinking')
      }
    }

    const onError = (error: Error) => {
      console.error('Vapi error:', error)

      stopTimer()
      setStatus('idle')

      if (sessionIdRef.current) {
        endVoiceSession(sessionIdRef.current, duration)
        sessionIdRef.current = null
      }

      setLimitError('Voice session ended unexpectedly')
    }

    vapi.on('call-start', onCallStart)
    vapi.on('call-end', onCallEnd)
    vapi.on('speech-start', onSpeechStart)
    vapi.on('speech-end', onSpeechEnd)
    vapi.on('message', onMessage)
    vapi.on('error', onError)

    return () => {
      vapi.off('call-start', onCallStart)
      vapi.off('call-end', onCallEnd)
      vapi.off('speech-start', onSpeechStart)
      vapi.off('speech-end', onSpeechEnd)
      vapi.off('message', onMessage)
      vapi.off('error', onError)

      stopTimer()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ----------------------------- START ----------------------------- */

  const start = useCallback(async () => {
    if (!userId) {
      setLimitError('Please login to start a conversation')
      return
    }

    if (status !== 'idle') return

    setStatus('connecting')
    setLimitError(null)

    try {
      const session = await startVoiceSession(userId, book._id)

      if (!session.success) {
        setLimitError(session.error || 'Session limit reached')
        setStatus('idle')
        return
      }

      sessionIdRef.current = session.sessionId || null

      await getVapi().start(ASSISTANT_ID, {
        firstMessage: `Hey! Have you already read ${book.title}?`,
        variableValues: {
          title: book.title,
          author: book.author,
          bookId: book._id
        },
        voice: {
          provider: '11labs',
          voiceId: getVoice(voice).id,
          model: 'eleven_turbo_v2_5',
          ...VOICE_SETTINGS
        }
      })
    } catch (err) {
      console.error('Start error', err)

      if (sessionIdRef.current) {
        endVoiceSession(sessionIdRef.current, 0)
        sessionIdRef.current = null
      }

      setStatus('idle')
      setLimitError('Failed to start voice session')
    }
  }, [userId, status, book, voice])

  /* ------------------------------ STOP ------------------------------ */

  const clearError = () => setLimitError(null)

  return {
    status,
    isActive,
    messages,
    currentMessage,
    currentUserMessage,
    duration,
    start,
    stop,
    clearError,
    limitError
  }
}

export default useVapi