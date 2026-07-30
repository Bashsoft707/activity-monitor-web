import type { ActivityEvent, DispatchOutcome, EventType } from './types'

/**
 * Base URL of the Express API. Must be NEXT_PUBLIC_ because the socket connection
 * and both fetches happen in the browser.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export const fetchEvents = async (): Promise<ActivityEvent[]> => {
  const response = await fetch(`${API_URL}/events`, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Could not load the feed (${response.status} from ${API_URL})`)
  }

  const body: { data: ActivityEvent[] } = await response.json()
  return body.data
}

export type CreateEventInput = {
  type: EventType
  label: string
  metadata?: Record<string, unknown>
}

export type CreateEventResult = {
  data: ActivityEvent
  notification: DispatchOutcome
}

/**
 * Note there is no `channel` field. The API derives the channel from the event
 * type and ignores any the client sends, so there is nothing to pass.
 */
export const createEvent = async (input: CreateEventInput): Promise<CreateEventResult> => {
  const response = await fetch(`${API_URL}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const body = await response.json()

  if (!response.ok) {
    throw new Error(body?.error ?? `Could not create the event (${response.status})`)
  }

  return body as CreateEventResult
}
