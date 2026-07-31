import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API_URL, createEvent, fetchEvents } from '@/lib/api'
import { buildEvent } from '../helpers/fake-socket'

const jsonResponse = (body: unknown, init: { ok?: boolean; status?: number } = {}) =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  }) as Response

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  describe('API_URL', () => {
    it('falls back to the local API when NEXT_PUBLIC_API_URL is unset', () => {
      // Set at build time, not runtime — a deployed frontend built without it will
      // call localhost, which is the single most common deploy mistake here.
      expect(API_URL).toBe(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000')
    })
  })

  describe('fetchEvents', () => {
    it('unwraps the data envelope', async () => {
      const events = [buildEvent(), buildEvent()]
      fetchMock.mockResolvedValue(jsonResponse({ data: events }))

      await expect(fetchEvents()).resolves.toEqual(events)
      expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/events`, { cache: 'no-store' })
    })

    it('bypasses the cache, so a reload shows current events', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ data: [] }))
      await fetchEvents()

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' })
    })

    it('throws with the status and the URL it tried', async () => {
      // The URL is in the message on purpose: the usual cause is the frontend
      // pointing at the wrong API, and the error should say which one it used.
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 502 }))

      await expect(fetchEvents()).rejects.toThrow(`502 from ${API_URL}`)
    })

    it('propagates a network failure', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

      await expect(fetchEvents()).rejects.toThrow('Failed to fetch')
    })
  })

  describe('createEvent', () => {
    it('posts JSON and returns the event with its notification outcome', async () => {
      const created = buildEvent()
      const notification = { channel: 'IN_APP' as const, delivered: true, detail: 'pushed to 1' }
      fetchMock.mockResolvedValue(jsonResponse({ data: created, notification }))

      const result = await createEvent({ type: 'USER_SIGNUP', label: 'New signup' })

      expect(result).toEqual({ data: created, notification })
      expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'USER_SIGNUP', label: 'New signup' }),
      })
    })

    it("surfaces the server's validation message rather than a generic one", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: 'label must be a non-empty string' }, { ok: false, status: 400 }),
      )

      await expect(createEvent({ type: 'USER_SIGNUP', label: '' })).rejects.toThrow(
        'label must be a non-empty string',
      )
    })

    it('falls back to the status when the body carries no error field', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }))

      await expect(createEvent({ type: 'USER_SIGNUP', label: 'x' })).rejects.toThrow('500')
    })
  })
})
