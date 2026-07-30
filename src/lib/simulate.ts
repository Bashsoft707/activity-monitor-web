import type { CreateEventInput } from './api'

/**
 * Payloads for the "Simulate Event" button.
 *
 * These live in the frontend on purpose. POST /events is a real event-creation
 * endpoint that requires a type and a label; inventing demo content is the
 * demo's job, not the API's. Keeping the canned strings here means the backend
 * carries no code that exists only to serve a button.
 *
 * The set deliberately spans all three channels so clicking repeatedly shows the
 * router making different decisions.
 */
const SAMPLES: CreateEventInput[] = [
  {
    type: 'USER_SIGNUP',
    label: 'New signup: ada@example.com',
    metadata: { recipient: 'ada@example.com', plan: 'free' },
  },
  {
    type: 'PAYMENT_RECEIVED',
    label: 'Payment received — ₦25,000 for invoice #1042',
    metadata: { recipient: '+2348012345678', amountKobo: 2_500_000 },
  },
  {
    type: 'PAYMENT_FAILED',
    label: 'Card declined for invoice #1042',
    metadata: { recipient: '+2348012345678', reason: 'insufficient_funds' },
  },
  {
    type: 'LOGIN_FAILED',
    label: 'Failed login from an unrecognised device in Lagos',
    metadata: { recipient: '+2348012345678', ip: '102.89.44.17' },
  },
  {
    type: 'ORDER_SHIPPED',
    label: 'Order #8821 shipped via GIG Logistics',
    metadata: { recipient: '+2348012345678', trackingId: 'GIG-8821' },
  },
  {
    type: 'SUBSCRIPTION_EXPIRING',
    label: 'Pro plan expires in 3 days',
    metadata: { recipient: '+2348012345678', daysRemaining: 3 },
  },
]

/** Avoids repeating the previous sample so consecutive clicks visibly differ. */
export const pickSample = (previous?: CreateEventInput): CreateEventInput => {
  const candidates = previous ? SAMPLES.filter((sample) => sample.type !== previous.type) : SAMPLES
  return candidates[Math.floor(Math.random() * candidates.length)] ?? SAMPLES[0]!
}
