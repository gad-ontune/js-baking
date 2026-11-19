import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createSeedData } from './seed'
import { uid } from './format'
import { SESSION_IDLE_MS } from './security'
import { hasPermission } from './permissions'
import { api } from './api'

const STORAGE_KEY = 'js-baking-house-v3'
const StoreContext = createContext(null)
const HEARTBEAT_MS = 5 * 60 * 1000

function loadInitialData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed?.inventory && parsed?.sales && parsed?.business) {
        // Clean up legacy browser-session fields. Authentication is now managed
        // by the backend; these values are kept only for local demo history.
        const lastActive = Number(parsed.sessionLastActive || 0)
        if (parsed.sessionUserId && (!lastActive || Date.now() - lastActive > SESSION_IDLE_MS)) {
          parsed.sessionUserId = null
          parsed.sessionLastActive = null
        }
        if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = []
        if (!Array.isArray(parsed.users)) parsed.users = []
        // Credentials must never live in browser storage.
        parsed.users = parsed.users.map(({ password, ...user }) => user)
        return parsed
      }
    }
  } catch {
    // Fall back to a fresh seeded demo when storage is unavailable or corrupt.
  }
  return createSeedData()
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(loadInitialData)
  const [toasts, setToasts] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [authStatus, setAuthStatus] = useState('loading')
  const [apiAvailable, setApiAvailable] = useState(true)
  const restoredRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage can be disabled; the app still works for the current session.
    }
  }, [data])

  /** Replace local demo collections with the authoritative server snapshot. */
  const hydrateBusiness = useCallback(async () => {
    try {
      const snapshot = await api.businessSnapshot()
      setData((previous) => ({ ...previous, ...snapshot }))
    } catch {
      // Keep the local demo data when the API is unavailable or the session
      // has ended. The backend remains the authority whenever it responds.
    }
  }, [])

  /** Merge the authoritative backend directory with local users referenced by demo history. */
  const setDirectory = useCallback((users) => {
    const incoming = Array.isArray(users) ? users : []
    setData((previous) => {
      const byId = new Map(previous.users.map((user) => [user.id, user]))
      const usernames = new Set(incoming.map((user) => String(user.username || '').toLowerCase()))
      const merged = incoming.map((user) => ({ ...(byId.get(user.id) || {}), ...user }))
      const localOnly = previous.users.filter(
        (user) => !usernames.has(String(user.username || '').toLowerCase()),
      )
      return { ...previous, users: [...merged, ...localOnly] }
    })
  }, [])

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    let active = true

    api.me()
      .then((user) => {
        if (!active) return
        setCurrentUser(user)
        setAuthStatus('authenticated')
        setApiAvailable(true)
        hydrateBusiness()
        api.listUsers().then((users) => { if (active) setDirectory(users) }).catch(() => {
          // Non-owners cannot list users; their own record is still authoritative.
          if (active) setDirectory([user])
        })
      })
      .catch((error) => {
        if (!active) return
        setCurrentUser(null)
        setAuthStatus('anonymous')
        setApiAvailable(!error.network)
      })

    return () => { active = false }
  }, [setDirectory, hydrateBusiness])

  // Keep the backend idle window alive while a tab is open, and notice remote
  // logout, deactivation or role changes without relying on browser state.
  useEffect(() => {
    if (authStatus !== 'authenticated') return undefined
    const timer = window.setInterval(() => {
      api.me()
        .then((user) => {
          setCurrentUser(user)
          setDirectory([user])
        })
        .catch((error) => {
          setCurrentUser(null)
          setAuthStatus('anonymous')
          if (error.network) setApiAvailable(false)
        })
    }, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [authStatus, setDirectory])

  const notify = useCallback((message, type = 'success') => {
    const id = uid('toast')
    setToasts((current) => [...current, { id, message, type }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3800)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  /** Perform a business write on the server, then refresh from the server. */
  const businessWrite = useCallback(
    async (operation, successMessage) => {
      try {
        const result = await operation(api)
        await hydrateBusiness()
        if (successMessage) notify(successMessage)
        return { ok: true, result }
      } catch (error) {
        notify(error.message || 'The change could not be saved.', 'error')
        return { ok: false, message: error.message }
      }
    },
    [hydrateBusiness, notify],
  )

  /** Apply a change to an isolated draft, keeping local demo history consistent. */
  const mutate = useCallback((recipe) => {
    setData((previous) => {
      const draft = structuredClone(previous)
      recipe(draft)
      if (draft.sessionUserId) draft.sessionLastActive = Date.now()
      return draft
    })
  }, [])

  const addAudit = useCallback(
    (draft, action, entity, details) => {
      draft.auditLogs.unshift({
        id: uid('audit'),
        action,
        entity,
        details,
        userId: currentUser?.id || null,
        date: new Date().toISOString(),
      })
    },
    [currentUser],
  )

  const can = useCallback(
    (permission) => Boolean(currentUser && hasPermission(currentUser.role, permission)),
    [currentUser],
  )

  const applySession = useCallback((result) => {
    setCurrentUser(result.user)
    setAuthStatus('authenticated')
    setApiAvailable(true)
    hydrateBusiness()
    api.listUsers().then(setDirectory).catch(() => setDirectory([result.user]))
  }, [setDirectory, hydrateBusiness])

  const signIn = useCallback(
    async (username, password) => {
      try {
        const result = await api.login(username, password)
        if (result.mfaRequired) {
          return { ok: true, mfaRequired: true, challengeToken: result.challengeToken }
        }
        applySession(result)
        return { ok: true, user: result.user }
      } catch (error) {
        return {
          ok: false,
          message: error.status === 401 ? 'Incorrect username or password.' : error.message,
          network: Boolean(error.network),
        }
      }
    },
    [applySession],
  )

  const completeMfa = useCallback(async (challengeToken, code) => {
    try {
      const result = await api.completeMfa(challengeToken, code)
      applySession(result)
      return { ok: true, user: result.user }
    } catch (error) {
      return { ok: false, message: error.message }
    }
  }, [applySession])

  const refreshUser = useCallback(async () => {
    try {
      const user = await api.me()
      setCurrentUser(user)
      setDirectory([user])
      return user
    } catch {
      return null
    }
  }, [setDirectory])

  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      // Clear local state even if the network fails; the server session will
      // still expire on its own.
    }
    setCurrentUser(null)
    setAuthStatus('anonymous')
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      const result = await api.changePassword(currentPassword, newPassword)
      setCurrentUser(result.user)
      setDirectory([result.user])
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error.message }
    }
  }, [setDirectory])

  // The backend enforces idle and absolute expiry. This hook is retained for
  // callers that previously touched the browser session; it is intentionally a
  // no-op rather than a second, weaker session authority.
  const touchSession = useCallback(() => {}, [])

  const resetDemo = useCallback(async () => {
    // Profile and configuration are local-only settings, so restore those
    // alongside the server's business collections.
    const fresh = createSeedData()
    const restoreLocalSettings = (previous) => ({
      ...previous,
      business: fresh.business,
      config: fresh.config,
      auditLogs: fresh.auditLogs,
      users: previous.users,
    })
    try {
      await api.resetDemoBusiness()
      setData(restoreLocalSettings)
      await hydrateBusiness()
      notify('Demo business data restored to its original state.')
      return { ok: true }
    } catch {
      // Offline fallback only: a later successful hydration restores the
      // server dataset again, so this is never treated as authoritative.
      setData((previous) => ({ ...restoreLocalSettings(previous), ...fresh }))
      notify('Server unavailable — demo data restored in this browser only.', 'error')
      return { ok: false }
    }
  }, [hydrateBusiness, notify])

  const value = useMemo(
    () => ({
      data,
      mutate,
      addAudit,
      businessWrite,
      hydrateBusiness,
      notify,
      toasts,
      dismissToast,
      currentUser,
      authStatus,
      apiAvailable,
      can,
      signIn,
      completeMfa,
      refreshUser,
      signOut,
      changePassword,
      touchSession,
      resetDemo,
      setDirectory,
    }),
    [data, mutate, addAudit, businessWrite, hydrateBusiness, notify, toasts, dismissToast, currentUser, authStatus, apiAvailable, can, signIn, completeMfa, refreshUser, signOut, changePassword, touchSession, resetDemo, setDirectory],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const context = useContext(StoreContext)
  if (!context) throw new Error('useStore must be used inside StoreProvider')
  return context
}
