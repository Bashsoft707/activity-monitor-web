// Adds the DOM matchers (toBeInTheDocument, toBeDisabled, …) to Vitest's expect,
// types included.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmounts anything a test rendered. Without this, a mounted component's socket
// effect stays subscribed and leaks into the next test.
afterEach(() => {
  cleanup()
})
