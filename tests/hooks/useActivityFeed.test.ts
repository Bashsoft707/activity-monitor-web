import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActivityFeed } from '@/hooks/useActivityFeed'
import { API_URL } from '@/lib/api'
import { FEED_EVENT, PUSH_EVENT } from '@/lib/types'
import { buildEvent, FakeSocket } from '../helpers/fake-socket'

/**
 * A plain function rather than vi.fn(): the suite runs with `restoreMocks`, which
 * would strip a vi.fn()'s implementation between tests and leave io() returning
 * undefined.
 */
const { socketRef } = vi.hoisted(() => ({
  socketRef: { current: null as unknown, urls: [] as string[] },
}))

vi.mock('socket.io-client', () => ({
  io: (url: string) => {
    socketRef.urls.push(url)
    return socketRef.current
  },
}))

const socket = (): FakeSocket => socketRef.current as FakeSocket

describe('useActivityFeed', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    socketRef.current = new FakeSocket()
    socketRef.urls.length = 0

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  const renderFeed = async () => {
    const view = renderHook(() => useActivityFeed())
    // The REST load resolves on a microtask; waiting here means every test starts
    // from a settled feed rather than racing it.
    await waitFor(() => expect(view.result.current.loading).toBe(false))
    return view
  }

  describe('initial load', () => {
    it('fills the feed from REST', async () => {
      const history = [buildEvent({ label: 'newest' }), buildEvent({ label: 'older' })]
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: history }) })

      const { result } = await renderFeed()

      expect(result.current.events).toEqual(history)
      expect(result.current.error).toBeNull()
    })

    it('reports an error and stops loading when the API is unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

      const { result } = await renderFeed()

      expect(result.current.error).toBe('Failed to fetch')
      expect(result.current.events).toEqual([])
    })

    it('opens the socket against the configured API', async () => {
      await renderFeed()

      expect(socketRef.urls).toEqual([API_URL])
    })
  })

  describe('connection state', () => {
    it('starts as connecting', () => {
      const { result } = renderHook(() => useActivityFeed())

      expect(result.current.connection).toBe('connecting')
    })

    it.each([
      ['connect', 'connected', (s: FakeSocket) => s.serverConnect()],
      ['disconnect', 'disconnected', (s: FakeSocket) => s.serverDisconnect()],
      ['connect_error', 'disconnected', (s: FakeSocket) => s.serverConnectError()],
    ])('maps %s to %s', async (_name, expected, trigger) => {
      const { result } = await renderFeed()

      act(() => trigger(socket()))

      expect(result.current.connection).toBe(expected)
    })
  })

  describe('live events', () => {
    it('prepends a pushed event, keeping newest first', async () => {
      const existing = buildEvent({ label: 'existing' })
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [existing] }),
      })
      const { result } = await renderFeed()

      const incoming = buildEvent({ label: 'incoming' })
      act(() => socket().fromServer(FEED_EVENT, incoming))

      expect(result.current.events.map((event) => event.label)).toEqual(['incoming', 'existing'])
    })

    it('de-duplicates an event already present from the REST load', async () => {
      // The real race this guards: the fetch and the socket handshake run
      // concurrently, so an event created in that window arrives from both.
      const raced = buildEvent({ label: 'arrived twice' })
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [raced] }) })
      const { result } = await renderFeed()

      act(() => socket().fromServer(FEED_EVENT, raced))

      expect(result.current.events).toHaveLength(1)
    })

    it('de-duplicates a repeated socket delivery', async () => {
      const { result } = await renderFeed()
      const event = buildEvent()

      act(() => {
        socket().fromServer(FEED_EVENT, event)
        socket().fromServer(FEED_EVENT, event)
      })

      expect(result.current.events).toHaveLength(1)
    })

    it('caps the feed at 100 rows and drops the oldest', async () => {
      const { result } = await renderFeed()

      act(() => {
        for (let index = 0; index < 105; index += 1) {
          socket().fromServer(FEED_EVENT, buildEvent({ label: `event ${index}` }))
        }
      })

      expect(result.current.events).toHaveLength(100)
      // Newest first, so the last one pushed leads and the earliest are gone.
      expect(result.current.events[0]?.label).toBe('event 104')
      expect(result.current.events.at(-1)?.label).toBe('event 5')
    })
  })

  describe('in-app push notifications', () => {
    it('surfaces a pushed event separately from the feed', async () => {
      // Two channels, one payload: the feed row and the notification are distinct
      // concerns, which is why the API emits them as different messages.
      const { result } = await renderFeed()
      const event = buildEvent({ label: 'pushed' })

      act(() => socket().fromServer(PUSH_EVENT, event))

      expect(result.current.pushed).toEqual(event)
    })

    it('clears on dismiss', async () => {
      const { result } = await renderFeed()
      act(() => socket().fromServer(PUSH_EVENT, buildEvent()))

      act(() => result.current.dismissPush())

      expect(result.current.pushed).toBeNull()
    })

    it('auto-dismisses after five seconds', async () => {
      vi.useFakeTimers()
      try {
        const { result } = renderHook(() => useActivityFeed())
        act(() => socket().fromServer(PUSH_EVENT, buildEvent()))
        expect(result.current.pushed).not.toBeNull()

        act(() => vi.advanceTimersByTime(5_000))

        expect(result.current.pushed).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('simulate', () => {
    const mockCreate = (event: ReturnType<typeof buildEvent>) => {
      fetchMock.mockImplementation((_url: string, init?: { method?: string }) =>
        init?.method === 'POST'
          ? Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                data: event,
                notification: { channel: 'IN_APP', delivered: true, detail: 'pushed to 1' },
              }),
            })
          : Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) }),
      )
    }

    it('creates an event and adds it to the feed', async () => {
      const created = buildEvent({ label: 'simulated' })
      const { result } = await renderFeed()
      mockCreate(created)

      await act(async () => {
        await result.current.simulate()
      })

      expect(result.current.events).toEqual([created])
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/events`,
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('does not double-add when the socket also delivers the event', async () => {
      // The normal path: the socket usually wins, and the POST response is the
      // fallback for when it is down. Both must not produce two rows.
      const created = buildEvent({ label: 'raced with socket' })
      const { result } = await renderFeed()
      mockCreate(created)

      await act(async () => {
        socket().fromServer(FEED_EVENT, created)
        await result.current.simulate()
      })

      expect(result.current.events).toHaveLength(1)
    })

    it('flags the request as in flight and clears it afterwards', async () => {
      const { result } = await renderFeed()
      let release: (value: unknown) => void = () => {}
      fetchMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve
          }),
      )

      let pending: Promise<void> = Promise.resolve()
      act(() => {
        pending = result.current.simulate()
      })
      expect(result.current.simulating).toBe(true)

      await act(async () => {
        release({ ok: true, status: 201, json: async () => ({ data: buildEvent() }) })
        await pending
      })
      expect(result.current.simulating).toBe(false)
    })

    it('reports a failure without leaving the button stuck', async () => {
      const { result } = await renderFeed()
      fetchMock.mockRejectedValue(new Error('label must be a non-empty string'))

      await act(async () => {
        await result.current.simulate()
      })

      expect(result.current.error).toBe('label must be a non-empty string')
      expect(result.current.simulating).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('disconnects the socket on unmount', async () => {
      // A leaked connection would keep receiving events and setting state on an
      // unmounted component.
      const { unmount } = await renderFeed()

      unmount()

      expect(socket().disconnect).toHaveBeenCalled()
    })
  })
})
