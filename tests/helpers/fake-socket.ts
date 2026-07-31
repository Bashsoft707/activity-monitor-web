import { vi } from 'vitest'
import type { ActivityEvent } from '@/lib/types'

type Handler = (payload?: unknown) => void

/**
 * Stand-in for a socket.io client.
 *
 * The real client is not used here for two reasons: it would need a server, and a
 * test could not then control *when* an event arrives. The interesting behaviour
 * in this app is ordering — an event landing before, during, or after the REST
 * load — so the tests need to drive emissions by hand.
 *
 * Only the surface `useActivityFeed` actually touches is implemented.
 */
export class FakeSocket {
  private readonly handlers = new Map<string, Set<Handler>>()

  connected = false
  readonly disconnect = vi.fn(() => {
    this.connected = false
  })
  readonly close = vi.fn()
  readonly emit = vi.fn()

  on(name: string, handler: Handler): this {
    const existing = this.handlers.get(name) ?? new Set<Handler>()
    existing.add(handler)
    this.handlers.set(name, existing)
    return this
  }

  once(name: string, handler: Handler): this {
    const wrapped: Handler = (payload) => {
      this.off(name, wrapped)
      handler(payload)
    }
    return this.on(name, wrapped)
  }

  off(name: string, handler?: Handler): this {
    if (handler === undefined) this.handlers.delete(name)
    else this.handlers.get(name)?.delete(handler)
    return this
  }

  /** Delivers a payload as if the server had emitted it. */
  fromServer(name: string, payload?: unknown): void {
    // Copied first: a handler that unsubscribes would otherwise mutate the set
    // mid-iteration.
    for (const handler of [...(this.handlers.get(name) ?? [])]) handler(payload)
  }

  serverConnect(): void {
    this.connected = true
    this.fromServer('connect')
  }

  serverDisconnect(): void {
    this.connected = false
    this.fromServer('disconnect')
  }

  serverConnectError(): void {
    this.connected = false
    this.fromServer('connect_error', new Error('refused'))
  }

  listenerCount(name: string): number {
    return this.handlers.get(name)?.size ?? 0
  }
}

let sequence = 0

/**
 * Builds an event. Ids increment so distinct events are distinct by default,
 * while an explicit id lets a test reuse one to exercise de-duplication.
 */
export const buildEvent = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => {
  sequence += 1
  return {
    id: `019fb4ba-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
    type: 'USER_SIGNUP',
    label: `Event ${sequence}`,
    channel: 'IN_APP',
    metadata: { recipient: 'ada@example.com' },
    createdAt: '2026-07-30T20:32:12.881Z',
    ...overrides,
  }
}
