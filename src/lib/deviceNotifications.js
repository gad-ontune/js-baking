const SEEN_KEY = 'js-baking-house-seen-alerts'

/** Notification API availability varies by browser and by secure context. */
export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/** Must be called from a user gesture (e.g. the Enable button) to be allowed. */
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function alertKey(alert) {
  return `${alert.id}:${alert.status}`
}

export function readSeenAlerts() {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? new Set(parsed) : null
  } catch {
    return null
  }
}

export function writeSeenAlerts(keys) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...keys]))
  } catch {
    // Storage may be disabled; notifications still work for the current session.
  }
}

export function fireDeviceNotification({ title, body, tag, onClick }) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return

  const options = {
    body,
    tag,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
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
    return
  } catch {
    // Some browsers (notably Android Chrome) only allow notifications via a service worker.
  }

  try {
    navigator.serviceWorker?.getRegistration().then((registration) => {
      registration?.showNotification?.(title, options)
    })
  } catch {
    // Notifications are best-effort; the in-app alerts remain available.
  }
}
