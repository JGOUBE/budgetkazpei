import { loadStripe } from '@stripe/stripe-js'

export const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)

export const PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID
