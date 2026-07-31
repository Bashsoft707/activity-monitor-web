# Activity Monitor — Web

Next.js frontend for the real-time activity monitor. Shows a live feed of logged
events and a **Simulate Event** button that writes a new one.

- **Live app:** _(Vercel URL — pending deploy)_
- **API:** _(Railway URL — pending deploy)_
- **API repository:** https://github.com/Bashsoft707/activity-monitor-api

## This app is a socket client, never a socket server

```
Next.js on Vercel  ──REST──▶  Express on Railway  ──▶  PostgreSQL
   (socket CLIENT)  ◀─WS───    (socket SERVER)
```

There is no Socket.io server anywhere in this repository, and no API route that
opens one. Vercel executes Next.js route handlers as serverless functions that are
created per request and torn down afterwards, so they cannot hold the long-lived
TCP connection a WebSocket needs. A socket server in a Next.js API route looks
fine under `next dev` — one long-running process — and then fails in production
once each request lands on a different short-lived instance. The server lives in
the Express app on Railway, which runs a persistent container.

## How the feed stays in sync

The initial page of history comes from `GET /events`. Every event after that
arrives on the socket. Both carry the same payload shape, so a pushed event is
appended directly onto the fetched list with no reconciliation step.

Two details that matter:

- **Events are de-duplicated by `id`.** The initial fetch and the socket
  connection race each other. An event created in the gap between the request
  going out and the socket attaching will legitimately arrive twice — once in the
  REST payload and once over the wire.
- **The server emits two different messages.** `event:created` carries *every*
  logged event and drives the feed. `notification:push` carries only events the
  server routed to the in-app channel and drives the toast. They are separate
  because a feed row and a notification are different things — an event routed to
  SMS still belongs in the activity log.

The feed is capped at 100 rows client-side so the DOM stays bounded.

## Setup

**Prerequisites:** Node.js ≥ 20 and the API running (see the API repository).

```bash
git clone https://github.com/Bashsoft707/activity-monitor-web.git
cd activity-monitor-web
npm install

cp .env.example .env.local   # defaults to http://localhost:4000
npm run dev                  # http://localhost:3000
```

You should see the status pill turn **live**, the existing events load, and
clicking **Simulate Event** append a row immediately.

If the feed shows an error, the two usual causes are the API not running, or the
origin you are serving from not being present in the API's `CORS_ORIGIN` allowlist.

### Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes in production | `http://localhost:4000` | Base URL of the Express API. Must be `NEXT_PUBLIC_` because the fetches and the socket connection all run in the browser. |

## Deploying to Vercel

1. Import the repository at [vercel.com/new](https://vercel.com/new). Next.js is
   detected automatically; no build settings need changing.
2. Add `NEXT_PUBLIC_API_URL` pointing at the Railway domain, e.g.
   `https://activity-monitor-api.up.railway.app` — no trailing slash.
3. Deploy, then add the resulting Vercel domain to the API's `CORS_ORIGIN` and
   redeploy the API.

Two things that catch people out:

- **`NEXT_PUBLIC_*` values are inlined at build time, not read at runtime.**
  Changing `NEXT_PUBLIC_API_URL` in the Vercel dashboard does nothing until you
  trigger a fresh deploy. If the deployed app is still calling `localhost:4000`,
  this is why.
- **Preview deployments get their own URLs.** The API's `CORS_ORIGIN` is an
  exact-match allowlist, so a preview domain is blocked unless it is added
  explicitly. Either test against the production domain or add the specific
  preview URL.

## Tests

```bash
npm test          # 48 tests
npm run test:watch
```

Vitest with Testing Library and jsdom. No API or database needed — `fetch` is
mocked and the socket is replaced by a controllable fake.

| Suite | Covers |
|---|---|
| `tests/lib/api.test.ts` | Request shapes, the `data` envelope, and error messages that name the URL they tried |
| `tests/lib/simulate.test.ts` | The Simulate payloads never repeat the previous type and never send a `channel` |
| `tests/hooks/useActivityFeed.test.ts` | REST load, socket subscription, de-duplication, connection state, the 100-row cap, toast auto-dismiss, unmount cleanup |
| `tests/app/page.test.tsx` | UI reactivity — what a viewer sees change when an event arrives |

The socket is faked rather than real, and that is the point: the interesting
behaviour here is *ordering*. Tests need to deliver an event before, during, or
after the REST load to prove de-duplication works, and a real connection cannot be
timed that precisely. `tests/helpers/fake-socket.ts` implements only the surface
the hook touches and exposes `fromServer(name, payload)` to drive emissions by hand.

Three cases are worth calling out:

- **The REST/socket race.** An event delivered by the socket that the initial fetch
  already returned must produce one row, not two. This is a real race, not a
  hypothetical — the fetch and the handshake run concurrently.
- **An SMS-routed event renders a feed row but no toast.** The server emits feed
  rows and push notifications as separate messages, and the UI has to keep them
  separate too.
- **The Simulate button's fallback does not double-add.** The socket normally
  delivers the created event first; adding the POST response as well must
  de-duplicate rather than duplicate.

Tests live outside `src/`, so they are type-checked by `npm run typecheck` and
`next build` but never bundled.

## Project structure

```
src/
  app/
    layout.tsx          fonts, metadata
    page.tsx            feed UI, connection pill, Simulate button, push toast
    globals.css         Tailwind entry and theme tokens
  hooks/
    useActivityFeed.ts  REST load + socket subscription, de-dup, connection state
  lib/
    api.ts              fetchEvents / createEvent
    types.ts            ActivityEvent contract and socket event names
    simulate.ts         payloads for the Simulate Event button
tests/
  helpers/              fake socket client, event factory
  lib/ hooks/ app/      mirrors the src layout
```

`src/lib/types.ts` restates the API's `EventDTO` rather than importing it, because
the two apps are separate repositories. In a monorepo this would be a shared
package, which is the first thing worth changing if a React Native client is added
— see the architecture note in the API's README.

`src/lib/simulate.ts` holds the demo payloads deliberately. `POST /events` is a
real event-creation endpoint that requires a type and a label; inventing demo
content is the demo's job, so the API carries no code that exists only to serve a
button. The samples span all three channels, so repeated clicks show the server
routing differently each time.

## Notes

- Next.js 16 (App Router), React 19, Tailwind CSS 4.
- The page is a client component because it owns a socket connection. There is no
  server-side data fetching to speak of — the feed is live by definition.
- The channel badge marks SMS and WhatsApp as `stub`. Only in-app push is really
  delivered; the other two log the message they would have sent, server-side.
