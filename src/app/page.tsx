'use client'

import { useActivityFeed, type ConnectionState } from '@/hooks/useActivityFeed'
import { API_URL } from '@/lib/api'
import type { ActivityEvent, NotificationChannel } from '@/lib/types'

const CHANNEL_BADGE: Record<NotificationChannel, string> = {
  IN_APP:
    'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/25',
  SMS: 'bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-300 dark:ring-amber-400/25',
  WHATSAPP: 'bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-300 dark:ring-sky-400/25',
}

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  IN_APP: 'in-app push',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
}

/** Only the in-app channel is really delivered; the other two log their intent. */
const CHANNEL_IS_LIVE: Record<NotificationChannel, boolean> = {
  IN_APP: true,
  SMS: false,
  WHATSAPP: false,
}

const CONNECTION_COPY: Record<ConnectionState, { text: string; dot: string }> = {
  connecting: { text: 'connecting', dot: 'bg-amber-500 animate-pulse' },
  connected: { text: 'live', dot: 'bg-emerald-500' },
  disconnected: { text: 'disconnected', dot: 'bg-red-500' },
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

function ChannelBadge({ channel }: { channel: NotificationChannel }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${CHANNEL_BADGE[channel]}`}
    >
      {CHANNEL_LABEL[channel]}
      {!CHANNEL_IS_LIVE[channel] && (
        <span className="opacity-60" title="Stubbed — the server logs what it would send">
          stub
        </span>
      )}
    </span>
  )
}

function EventRow({ event }: { event: ActivityEvent }) {
  return (
    <li className="animate-slide-in flex items-start gap-4 px-4 py-3.5 sm:px-5">
      <time
        dateTime={event.createdAt}
        className="w-20 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-black/45 dark:text-white/40"
      >
        {formatTime(event.createdAt)}
      </time>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{event.label}</p>
        <p className="mt-1 font-mono text-[11px] tracking-tight text-black/45 dark:text-white/40">
          {event.type}
        </p>
      </div>

      <ChannelBadge channel={event.channel} />
    </li>
  )
}

export default function Home() {
  const { events, connection, loading, error, pushed, dismissPush, simulate, simulating } =
    useActivityFeed()

  const status = CONNECTION_COPY[connection]

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Real-Time Activity Monitor
          </h1>
          <p className="mt-1.5 text-sm text-black/55 dark:text-white/50">
            Events stream in over WebSockets as they are written.
          </p>
        </div>

        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ring-black/10 dark:ring-white/15"
          aria-live="polite"
        >
          <span className={`size-2 rounded-full ${status.dot}`} aria-hidden />
          {status.text}
        </span>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={simulate}
          disabled={simulating}
          className="bg-foreground text-background rounded-lg px-4 py-2.5 text-sm font-medium transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {simulating ? 'Simulating…' : 'Simulate Event'}
        </button>

        <p className="text-xs text-black/45 dark:text-white/40">
          {events.length === 0
            ? 'no events yet'
            : `${events.length} event${events.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/20 dark:text-red-300 dark:ring-red-400/25"
        >
          <p className="font-medium">{error}</p>
          <p className="mt-1 text-xs opacity-80">
            Expecting the API at <code className="font-mono">{API_URL}</code>. Check that it is
            running and that this origin is in its CORS_ORIGIN allowlist.
          </p>
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-xl ring-1 ring-black/10 dark:ring-white/10">
        {loading ? (
          <p className="px-5 py-12 text-center text-sm text-black/45 dark:text-white/40">
            Loading feed…
          </p>
        ) : events.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-black/45 dark:text-white/40">
            Nothing logged yet. Hit <span className="font-medium">Simulate Event</span> to push one
            through.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-5 text-xs leading-relaxed text-black/45 dark:text-white/40">
        The server picks a channel per event type and stores its decision — clients cannot choose
        one. Only <span className="font-medium">in-app push</span> is really delivered; SMS and
        WhatsApp are stubbed and log the message they would have sent.
      </p>

      {pushed && (
        <div
          role="status"
          className="animate-slide-in bg-background fixed inset-x-4 bottom-4 z-10 rounded-xl px-4 py-3 shadow-lg ring-1 ring-black/10 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-80 dark:ring-white/15"
        >
          <div className="flex items-start gap-3">
            <span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                In-app push received
              </p>
              <p className="mt-0.5 truncate text-sm">{pushed.label}</p>
            </div>
            <button
              type="button"
              onClick={dismissPush}
              aria-label="Dismiss notification"
              className="-m-1 shrink-0 rounded p-1 text-black/40 transition hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
