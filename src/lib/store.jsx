import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createSeedData } from './seed'
import { uid } from './format'

const STORAGE_KEY = 'crumb-co-bakery-v2'
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
      if (parsed?.inventory && parsed?.sales && parsed?.business) return parsed
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
    () => data.users.find((user) => user.id === data.sessionUserId) || null,
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
      const user = data.users.find(
        (candidate) =>
          candidate.username.toLowerCase() === username.trim().toLowerCase() &&
          candidate.password === password &&
          candidate.active,
      )
      if (!user) return { ok: false, message: 'Incorrect username or password.' }
      mutate((draft) => {
        draft.sessionUserId = user.id
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
    })
  }, [currentUser, mutate])

  const resetDemo = useCallback(() => {
    setData(createSeedData())
    notify('Demo data restored to its original state.')
  }, [notify])

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
      resetDemo,
    }),
    [data, mutate, addAudit, notify, toasts, dismissToast, currentUser, can, signIn, signOut, resetDemo],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const context = useContext(StoreContext)
  if (!context) throw new Error('useStore must be used inside StoreProvider')
  return context
}
