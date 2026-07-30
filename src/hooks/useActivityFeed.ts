'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_URL, createEvent, fetchEvents, type CreateEventInput } from '@/lib/api'
import { pickSample } from '@/lib/simulate'
import { FEED_EVENT, PUSH_EVENT, type ActivityEvent } from '@/lib/types'

/** Keeps the DOM bounded on a feed that never stops growing. */
const MAX_FEED_LENGTH = 100

export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

export const useActivityFeed = () => {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pushed, setPushed] = useState<ActivityEvent | null>(null)
  const [simulating, setSimulating] = useState(false)
  const lastSample = useRef<CreateEventInput | undefined>(undefined)

  /**
   * Prepends, de-duplicating on id. The REST load and the socket stream race:
   * an event created between the fetch being issued and the socket connecting
   * can legitimately arrive twice. Ids are UUIDv7 so the newest-first order the
   * API returns is preserved by simply unshifting.
   */
  const addEvent = useCallback((incoming: ActivityEvent) => {
    setEvents((current) =>
      current.some((event) => event.id === incoming.id)
        ? current
        : [incoming, ...current].slice(0, MAX_FEED_LENGTH),
    )
  }, [])

  useEffect(() => {
    let cancelled = false

    // Initial page of history over REST; the socket carries everything after.
    fetchEvents()
      .then((initial) => {
        if (cancelled) return
        setEvents(initial)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Could not load the feed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // Default transports (polling, upgrading to websocket) rather than forcing
    // websocket-only, which fails behind proxies that do not pass upgrades.
    const socket: Socket = io(API_URL)

    socket.on('connect', () => setConnection('connected'))
    socket.on('disconnect', () => setConnection('disconnected'))
    socket.on('connect_error', () => setConnection('disconnected'))
    socket.on(FEED_EVENT, addEvent)
    socket.on(PUSH_EVENT, (event: ActivityEvent) => setPushed(event))

    return () => {
      cancelled = true
      socket.disconnect()
    }
  }, [addEvent])

  // Auto-dismiss the in-app push toast.
  useEffect(() => {
    if (!pushed) return
    const timer = setTimeout(() => setPushed(null), 5000)
    return () => clearTimeout(timer)
  }, [pushed])

  const simulate = useCallback(async () => {
    setSimulating(true)
    setError(null)

    try {
      const sample = pickSample(lastSample.current)
      lastSample.current = sample
      const result = await createEvent(sample)

      // The socket normally delivers this first and addEvent de-duplicates it.
      // This is the fallback for when the socket is down, so the button still
      // works and the feed still updates.
      addEvent(result.data)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not create the event')
    } finally {
      setSimulating(false)
    }
  }, [addEvent])

  return {
    events,
    connection,
    loading,
    error,
    pushed,
    dismissPush: useCallback(() => setPushed(null), []),
    simulate,
    simulating,
  }
}
