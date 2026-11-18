export const MIN_PASSWORD_LENGTH = 12
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000

/** Reject empty strings, NaN, Infinity and non-numeric input. */
export function isFiniteNumber(value) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return false
  return Number.isFinite(Number(value))
}

export function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && Number(value) >= 0
}

export function isPositiveNumber(value) {
  return isFiniteNumber(value) && Number(value) > 0
}

export function isValidDateValue(value) {
  if (typeof value !== 'string' && !(value instanceof Date)) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

export function isValidEmail(value) {
  if (!value) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
}

/** Return a short password-policy error, or null when acceptable. */
export function passwordPolicyError(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (password.length > 1024) return 'Password is too long.'
  if (/\s/.test(password) && password.trim() !== password) return 'Password cannot start or end with whitespace.'
  return null
}

/**
 * Resolve a navigation target only when it stays on this application origin.
 * Backslashes and protocol-relative URLs are rejected because they have been
 * used for open redirects in client routers.
 */
export function safeInternalPath(value, origin = 'http://localhost') {
  if (typeof value !== 'string') return null
  const target = value.trim()
  if (!target || target.includes('\\')) return null

  try {
    const url = new URL(target, origin)
    if (url.origin !== new URL(origin).origin) return null
    if (url.username || url.password) return null
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function safeAbsoluteInternalUrl(value, origin = 'http://localhost') {
  const path = safeInternalPath(value, origin)
  if (!path) return null
  try {
    return new URL(path, origin).href
  } catch {
    return null
  }
}
