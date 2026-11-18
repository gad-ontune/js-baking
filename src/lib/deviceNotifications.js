import { safeAbsoluteInternalUrl } from './security'

const ICON = '/icon-192.png'
const BADGE = '/badge-96.png'
let registrationPromise = null

/** Notifications require a secure context (HTTPS or localhost) on most devices. */
export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/** Register once so notifications can be shown even when the tab is backgrounded. */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null)
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register('/sw.js')
      .catch(() => null)
  }
  return registrationPromise
}

/** Must be called from a user gesture (for example an Enable button). */
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  await registerServiceWorker()

  if (Notification.permission !== 'default') return Notification.permission

  try {
    return await new Promise((resolve) => {
      const result = Notification.requestPermission(resolve)
      if (result && typeof result.then === 'function') result.then(resolve).catch(() => resolve('denied'))
    })
  } catch {
    return 'denied'
  }
}

/**
 * Prefer the service worker so alerts reach the device notification centre,
 * including from a background tab. Fall back to the browser Notification API.
 */
export async function fireDeviceNotification({ title, body, tag, url = '/notifications', onClick }) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return

  const target = safeAbsoluteInternalUrl(url, window.location.origin) || new URL('/notifications', window.location.origin).href
  const options = {
    body,
    tag,
    icon: ICON,
    badge: BADGE,
    data: { url: target },
    actions: [{ action: 'open', title: 'Open notification centre' }],
  }

  const registration = await registerServiceWorker()
  if (registration?.showNotification) {
    try {
      await registration.showNotification(title, options)
      return
    } catch {
      // Fall through to the legacy API below.
    }
  }

  try {
    const notification = new Notification(title, options)
    if (onClick) {
      notification.onclick = () => {
        window.focus()
        onClick()
        notification.close()
      }
    }
  } catch {
    // Notifications are best-effort; the in-app inbox remains available.
  }
}

export function sendTestDeviceNotification(businessName = 'JS Baking House') {
  return fireDeviceNotification({
    title: `Test notification — ${businessName}`,
    body: 'Device notifications are working. Open the notification centre to review your alerts.',
    tag: `test-${Date.now()}`,
    url: '/notifications',
  })
}
