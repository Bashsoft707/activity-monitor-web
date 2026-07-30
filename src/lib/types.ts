export const EVENT_TYPES = [
  'USER_SIGNUP',
  'PAYMENT_RECEIVED',
  'PAYMENT_FAILED',
  'LOGIN_FAILED',
  'ORDER_SHIPPED',
  'SUBSCRIPTION_EXPIRING',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const NOTIFICATION_CHANNELS = ['IN_APP', 'SMS', 'WHATSAPP'] as const

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

/**
 * Mirrors the API's EventDTO. Both the REST response and the socket payload use
 * this exact shape, which is what lets a pushed event be appended straight onto
 * the list fetched over REST.
 *
 * In a monorepo this would be imported from a shared package rather than
 * restated; kept local here because the API and the web app are separate repos.
 */
export type ActivityEvent = {
  id: string
  type: EventType
  label: string
  channel: NotificationChannel
  metadata: Record<string, unknown> | null
  createdAt: string
}

export type DispatchOutcome = {
  channel: NotificationChannel
  delivered: boolean
  detail: string
}

/** Socket event names. Defined by the API in src/realtime/socket.ts. */
export const FEED_EVENT = 'event:created'
export const PUSH_EVENT = 'notification:push'
