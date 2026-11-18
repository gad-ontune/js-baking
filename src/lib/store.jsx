import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createSeedData } from './seed'
import { uid } from './format'
import { SESSION_IDLE_MS } from './security'

const STORAGE_KEY = 'js-baking-house-v3'
const StoreContext = createContext(null)

const ROLE_PERMISSIONS = {
  owner: ['*'],
  staff: [
    'dashboard.view',
    'inventory.view',
    'inventory.manage',
    'purchases.view',
    'suppliers.view',
    'production.view',
    'production.manage',
    'sales.view',
    'sales.manage',
    'expenses.view',
    'expenses.manage',
    'reports.basic',
  ],
}

function loadInitialData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed?.inventory && parsed?.sales && parsed?.business) {
        // Expire stale demo sessions on load. Production sessions must be
        // enforced by the backend, not by browser state.
        const lastActive = Number(parsed.sessionLastActive || 0)
        if (parsed.sessionUserId && (!lastActive || Date.now() - lastActive > SESSION_IDLE_MS)) {
          parsed.sessionUserId = null
          parsed.sessionLastActive = null
        }
        if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = []
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage can be disabled; the app still works for the current session.
    }
  }, [data])

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

  /** Apply a change to an isolated draft, keeping persistence and history consistent. */
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
        userId: draft.sessionUserId,
        date: new Date().toISOString(),
      })
    },
    [],
  )

  const currentUser = useMemo(
    () => data.users.find((user) => user.id === data.sessionUserId && user.active) || null,
    [data.users, data.sessionUserId],
  )

  const can = useCallback(
    (permission) => {
      if (!currentUser) return false
      const permissions = ROLE_PERMISSIONS[currentUser.role] || []
      return permissions.includes('*') || permissions.includes(permission)
    },
    [currentUser],
  )

  const signIn = useCallback(
    (username, password) => {
      const normalized = String(username || '').trim().toLowerCase()
      const user = data.users.find(
        (candidate) =>
          String(candidate.username || '').toLowerCase() === normalized &&
          candidate.password === password &&
          candidate.active,
      )

      if (!user) {
        // Never reveal which part of the credentials was wrong.
        mutate((draft) => {
          draft.auditLogs.unshift({
            id: uid('audit'),
            action: 'LOGIN_FAILED',
            entity: 'Authentication',
            details: 'Failed sign-in attempt',
            userId: null,
            date: new Date().toISOString(),
          })
        })
        return { ok: false, message: 'Incorrect username or password.' }
      }

      mutate((draft) => {
        draft.sessionUserId = user.id
        draft.sessionLastActive = Date.now()
        draft.auditLogs.unshift({
          id: uid('audit'),
          action: 'USER_LOGIN',
          entity: 'User',
          details: `${user.name} signed in`,
          userId: user.id,
          date: new Date().toISOString(),
        })
      })
      return { ok: true, user }
    },
    [data.users, mutate],
  )

  const signOut = useCallback(() => {
    mutate((draft) => {
      draft.auditLogs.unshift({
        id: uid('audit'),
        action: 'USER_LOGOUT',
        entity: 'User',
        details: `${currentUser?.name || 'User'} signed out`,
        userId: draft.sessionUserId,
        date: new Date().toISOString(),
      })
      draft.sessionUserId = null
      draft.sessionLastActive = null
    })
  }, [currentUser, mutate])

  const touchSession = useCallback(() => {
    setData((previous) =>
      previous.sessionUserId ? { ...previous, sessionLastActive: Date.now() } : previous,
    )
  }, [])

  const resetDemo = useCallback(() => {
    const fresh = createSeedData()
    fresh.auditLogs.unshift({
      id: uid('audit'),
      action: 'DEMO_RESET',
      entity: 'Application',
      details: 'Demo data restored to seeded state',
      userId: currentUser?.id || null,
      date: new Date().toISOString(),
    })
    setData(fresh)
    notify('Demo data restored to its original state.')
  }, [currentUser, notify])

  const value = useMemo(
    () => ({
      data,
      mutate,
      addAudit,
      notify,
      toasts,
      dismissToast,
      currentUser,
      can,
      signIn,
      signOut,
      touchSession,
      resetDemo,
    }),
    [data, mutate, addAudit, notify, toasts, dismissToast, currentUser, can, signIn, signOut, touchSession, resetDemo],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const context = useContext(StoreContext)
  if (!context) throw new Error('useStore must be used inside StoreProvider')
  return context
}
