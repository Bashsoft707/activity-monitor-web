import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Home from '@/app/page'
import { FEED_EVENT, PUSH_EVENT } from '@/lib/types'
import { buildEvent, FakeSocket } from '../helpers/fake-socket'

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

/**
 * Renders the real page against a controllable socket.
 *
 * This is the "UI reactivity" half of the brief: the assertions are about what a
 * user sees change when an event arrives, not about hook internals.
 */
describe('activity monitor page', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  const mockHistory = (events: ReturnType<typeof buildEvent>[]) => {
    fetchMock.mockImplementation((_url: string, init?: { method?: string }) =>
      init?.method === 'POST'
        ? Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              data: buildEvent({ label: 'created by the button' }),
              notification: { channel: 'IN_APP', delivered: true, detail: 'pushed to 1' },
            }),
          })
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ data: events }) }),
    )
  }

  beforeEach(() => {
    socketRef.current = new FakeSocket()
    socketRef.urls.length = 0
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mockHistory([])
  })

  const renderPage = async () => {
    render(<Home />)
    await waitFor(() => expect(screen.queryByText('Loading feed…')).not.toBeInTheDocument())
  }

  describe('first paint', () => {
    it('shows the loading state before the feed arrives', () => {
      render(<Home />)

      expect(screen.getByText('Loading feed…')).toBeInTheDocument()
    })

    it('invites the first event when there is no history', async () => {
      await renderPage()

      expect(screen.getByText(/Nothing logged yet/)).toBeInTheDocument()
      expect(screen.getByText('no events yet')).toBeInTheDocument()
    })

    it('renders the events it loaded, newest first', async () => {
      mockHistory([buildEvent({ label: 'newest event' }), buildEvent({ label: 'older event' })])
      await renderPage()

      const rows = screen.getAllByRole('listitem')
      expect(rows).toHaveLength(2)
      expect(within(rows[0]!).getByText('newest event')).toBeInTheDocument()
      expect(within(rows[1]!).getByText('older event')).toBeInTheDocument()
      expect(screen.getByText('2 events')).toBeInTheDocument()
    })

    it('uses the singular for a single event', async () => {
      mockHistory([buildEvent()])
      await renderPage()

      expect(screen.getByText('1 event')).toBeInTheDocument()
    })
  })

  describe('connection indicator', () => {
    it('reads connecting, then live, then disconnected', async () => {
      await renderPage()
      expect(screen.getByText('connecting')).toBeInTheDocument()

      act(() => socket().serverConnect())
      expect(await screen.findByText('live')).toBeInTheDocument()

      act(() => socket().serverDisconnect())
      expect(await screen.findByText('disconnected')).toBeInTheDocument()
    })
  })

  describe('reacting to a pushed event', () => {
    it('adds a row the moment the socket delivers one', async () => {
      await renderPage()
      expect(screen.queryByText('arrived over the socket')).not.toBeInTheDocument()

      act(() =>
        socket().fromServer(FEED_EVENT, buildEvent({ label: 'arrived over the socket' })),
      )

      expect(await screen.findByText('arrived over the socket')).toBeInTheDocument()
      expect(screen.getByText('1 event')).toBeInTheDocument()
    })

    it('replaces the empty state with the feed', async () => {
      await renderPage()
      expect(screen.getByText(/Nothing logged yet/)).toBeInTheDocument()

      act(() => socket().fromServer(FEED_EVENT, buildEvent()))

      await waitFor(() =>
        expect(screen.queryByText(/Nothing logged yet/)).not.toBeInTheDocument(),
      )
      expect(screen.getByRole('list')).toBeInTheDocument()
    })

    it('shows the newest row at the top', async () => {
      mockHistory([buildEvent({ label: 'was already here' })])
      await renderPage()

      act(() => socket().fromServer(FEED_EVENT, buildEvent({ label: 'just arrived' })))

      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
      expect(within(screen.getAllByRole('listitem')[0]!).getByText('just arrived')).toBeInTheDocument()
    })
  })

  describe('channel badges', () => {
    it.each([
      ['IN_APP' as const, 'in-app push', false],
      ['SMS' as const, 'SMS', true],
      ['WHATSAPP' as const, 'WhatsApp', true],
    ])('labels a %s event and marks it stubbed only when it is', async (channel, label, stubbed) => {
      // The badge is how a viewer can tell the implemented channel from the two
      // that only log their intent.
      mockHistory([buildEvent({ channel, label: `${channel} event` })])
      await renderPage()

      const row = screen.getByRole('listitem')
      expect(within(row).getByText(label)).toBeInTheDocument()
      if (stubbed) expect(within(row).getByText('stub')).toBeInTheDocument()
      else expect(within(row).queryByText('stub')).not.toBeInTheDocument()
    })
  })

  describe('in-app push toast', () => {
    it('appears on a push and can be dismissed', async () => {
      await renderPage()

      act(() => socket().fromServer(PUSH_EVENT, buildEvent({ label: 'you have a new signup' })))

      const toast = await screen.findByRole('status')
      expect(within(toast).getByText('In-app push received')).toBeInTheDocument()
      expect(within(toast).getByText('you have a new signup')).toBeInTheDocument()

      await userEvent.click(within(toast).getByRole('button', { name: 'Dismiss notification' }))
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    })

    it('stays silent for an event that only reached the feed', async () => {
      // An SMS-routed event is a feed row, not an in-app notification.
      await renderPage()

      act(() => socket().fromServer(FEED_EVENT, buildEvent({ channel: 'SMS' })))

      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  describe('Simulate Event button', () => {
    it('posts an event and shows it in the feed', async () => {
      await renderPage()

      await userEvent.click(screen.getByRole('button', { name: 'Simulate Event' }))

      expect(await screen.findByText('created by the button')).toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/events'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('disables itself while the request is in flight', async () => {
      await renderPage()
      let release: (value: unknown) => void = () => {}
      fetchMock.mockImplementation(
        () => new Promise((resolve) => { release = resolve }),
      )

      await userEvent.click(screen.getByRole('button', { name: 'Simulate Event' }))

      const button = screen.getByRole('button', { name: 'Simulating…' })
      expect(button).toBeDisabled()

      await act(async () => {
        release({ ok: true, status: 201, json: async () => ({ data: buildEvent() }) })
      })
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Simulate Event' })).toBeEnabled(),
      )
    })
  })

  describe('error reporting', () => {
    it('explains the likely causes when the feed cannot load', async () => {
      // The two real causes are the API being down and the origin missing from
      // CORS_ORIGIN, so the alert names both rather than just failing.
      fetchMock.mockRejectedValue(new Error('Failed to fetch'))
      await renderPage()

      const alert = screen.getByRole('alert')
      expect(within(alert).getByText('Failed to fetch')).toBeInTheDocument()
      expect(within(alert).getByText(/CORS_ORIGIN/)).toBeInTheDocument()
    })
  })
})
