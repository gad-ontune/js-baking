import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Apple,
  ArrowUpRight,
  Bell,
  Boxes,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Factory,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Tags,
  TriangleAlert,
  Truck,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { periodLabel } from '../lib/analytics'
import { formatDate } from '../lib/format'
import { useNotifications } from '../lib/notificationCenter'
import { Avatar } from './ui'

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
      { to: '/notifications', label: 'Notifications', icon: Bell, permission: 'dashboard.view' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { to: '/inventory', label: 'All Items', icon: Package, permission: 'inventory.view' },
      { to: '/inventory/categories', label: 'Categories', icon: Tags, permission: 'inventory.view' },
      { to: '/inventory/movements', label: 'Stock Movements', icon: Boxes, permission: 'inventory.view' },
      { to: '/inventory/low-stock', label: 'Low Stock', icon: TriangleAlert, permission: 'inventory.view' },
      { to: '/inventory/expiry', label: 'Expiry Tracking', icon: Apple, permission: 'inventory.view' },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { to: '/purchases', label: 'Purchases', icon: ShoppingCart, permission: 'purchases.view' },
      { to: '/purchases/suppliers', label: 'Suppliers', icon: Truck, permission: 'suppliers.view' },
      { to: '/purchases/balances', label: 'Supplier Balances', icon: Wallet, permission: 'purchases.view' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/production', label: 'Production', icon: Factory, permission: 'production.view' },
      { to: '/sales', label: 'Sales', icon: ReceiptText, permission: 'sales.view' },
      { to: '/expenses', label: 'Expenses', icon: CircleDollarSign, permission: 'expenses.view' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/reports/financial', label: 'Financial Reports', icon: ChartNoAxesCombined, permission: 'reports.basic' },
      { to: '/reports/inventory', label: 'Inventory Reports', icon: ClipboardList, permission: 'reports.basic' },
      { to: '/reports/purchases', label: 'Purchase Reports', icon: FileBarChart, permission: 'reports.basic' },
      { to: '/reports/products', label: 'Product Performance', icon: ArrowUpRight, permission: 'reports.basic' },
      { to: '/reports/production', label: 'Production Reports', icon: Factory, permission: 'reports.basic' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/settings/business', label: 'Business Profile', icon: Store, permission: 'settings.view' },
      { to: '/settings/users', label: 'Users & Permissions', icon: UserCog, permission: 'settings.view' },
      { to: '/settings/configuration', label: 'Categories & Config', icon: Settings, permission: 'settings.view' },
      { to: '/settings/audit', label: 'Audit History', icon: ClipboardList, permission: 'settings.view' },
    ],
  },
]

const ROUTE_TITLES = {
  '/dashboard': 'Dashboard',
  '/notifications': 'Notification Centre',
  '/inventory': 'All Items',
  '/inventory/categories': 'Inventory Categories',
  '/inventory/movements': 'Stock Movements',
  '/inventory/low-stock': 'Low Stock',
  '/inventory/expiry': 'Expiry Tracking',
  '/purchases': 'Purchases',
  '/purchases/suppliers': 'Suppliers',
  '/purchases/balances': 'Supplier Balances',
  '/production': 'Production Records',
  '/sales': 'Sales',
  '/expenses': 'Expenses',
  '/reports/financial': 'Financial Reports',
  '/reports/inventory': 'Inventory Reports',
  '/reports/purchases': 'Purchase Reports',
  '/reports/products': 'Product Performance',
  '/reports/production': 'Production Reports',
  '/settings/business': 'Business Profile',
  '/settings/users': 'Users & Permissions',
  '/settings/configuration': 'Categories & Configuration',
  '/settings/audit': 'Audit History',
}

function Sidebar({ collapsed, onToggle, onNavigate, mobile = false, onClose }) {
  const { can, data } = useStore()

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-white transition-all duration-300 ${collapsed ? 'w-[76px]' : 'w-[264px]'}`}>
      <div className={`flex h-[74px] items-center border-b border-line ${collapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
        <NavLink to="/dashboard" className="flex items-center gap-3" onClick={onNavigate}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bakery-600 font-display text-base font-bold text-white shadow-sm">{data.business.logoText?.slice(0, 2) || 'C'}</span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-display text-base font-bold leading-tight text-ink">{data.business.name}</span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-widest text-bakery-600">Business Suite</span>
            </span>
          )}
        </NavLink>
        {!collapsed && (mobile ? (
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-bakery-50 hover:text-ink" aria-label="Close menu">
            <X size={18} />
          </button>
        ) : (
          <button type="button" onClick={onToggle} className="rounded-lg p-1.5 text-muted hover:bg-bakery-50 hover:text-ink" aria-label="Collapse sidebar">
            <ChevronLeft size={18} />
          </button>
        ))}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => can(item.permission))
          if (!visibleItems.length) return null
          return (
            <div key={group.label} className="mb-5">
              {!collapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted/70">{group.label}</p>}
              <div className="space-y-0.5">
                {visibleItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onNavigate}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        isActive ? 'bg-bakery-600 text-white shadow-sm' : 'text-[#5C5149] hover:bg-bakery-50 hover:text-ink'
                      } ${collapsed ? 'justify-center' : ''}`
                    }
                  >
                    <Icon size={18} strokeWidth={1.8} className="shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                    {collapsed && <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white group-hover:block">{label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {!collapsed && (
        <div className="m-3 rounded-2xl bg-bakery-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-bakery-700">
            <Users size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Demo workspace</span>
          </div>
          <p className="text-xs leading-relaxed text-bakery-800/80">All records are stored in this browser. Use Settings to restore the original demo data.</p>
        </div>
      )}
      {collapsed && (
        <button type="button" onClick={onToggle} className="m-3 flex h-10 items-center justify-center rounded-xl border border-line text-muted hover:bg-bakery-50" aria-label="Expand sidebar">
          <ChevronRight size={18} />
        </button>
      )}
    </aside>
  )
}

export default function Layout() {
  const { data, currentUser, signOut, touchSession } = useStore()
  const { unreadCount } = useNotifications()
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setUserMenuOpen(false)
    setMobileOpen(false)
    touchSession()
  }, [location.pathname, touchSession])

  const title = ROUTE_TITLES[location.pathname] || 'Dashboard'
  const period = periodLabel('30d')

  const handleSearch = (event) => {
    event.preventDefault()
    if (!query.trim()) return
    navigate(`/inventory?q=${encodeURIComponent(query.trim())}`)
    setQuery('')
    setMobileOpen(false)
  }

  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="animate-slide-in absolute inset-y-0 left-0 w-[min(280px,86vw)]">
            <Sidebar collapsed={false} mobile onClose={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className={`transition-all duration-300 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]'}`}>
        <header className="sticky top-0 z-30 flex h-[74px] items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-xl border border-line bg-white p-2 text-ink lg:hidden" aria-label="Open menu">
            <Menu size={19} />
          </button>
          <div className="min-w-0">
            <p className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted sm:block">{period}</p>
            <h1 className="max-w-[110px] truncate font-display text-sm font-semibold text-ink sm:max-w-sm md:text-xl">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <form onSubmit={handleSearch} className="relative hidden sm:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search inventory…"
                className="input w-48 py-2 pl-9 lg:w-64"
              />
            </form>
            <button
              type="button"
              onClick={() => { navigate('/notifications'); setUserMenuOpen(false) }}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-ink transition hover:border-bakery-300"
              aria-label="Open notification centre"
              title="Notification centre"
            >
              <Bell size={18} />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((value) => !value)}
                className="flex items-center gap-2 rounded-xl border border-line bg-white py-1.5 pl-1.5 pr-2.5 transition hover:border-bakery-300"
              >
                <Avatar name={currentUser?.name || 'User'} size="sm" />
                <span className="hidden text-left sm:block">
                  <span className="block text-xs font-bold text-ink">{currentUser?.name}</span>
                  <span className="block text-[10px] capitalize text-muted">{currentUser?.role}</span>
                </span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-line bg-white p-2 shadow-lift">
                  <div className="border-b border-line px-3 py-2">
                    <p className="text-sm font-semibold text-ink">{currentUser?.name}</p>
                    <p className="text-xs text-muted">{currentUser?.email}</p>
                  </div>
                  <button type="button" onClick={() => { navigate('/settings/business'); setUserMenuOpen(false) }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-bakery-50">
                    <Settings size={15} /> Settings
                  </button>
                  <button type="button" onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
        <footer className="border-t border-line px-6 py-5 text-center text-xs text-muted">
          {data.business.name} · {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Internal business use
        </footer>
      </div>
    </div>
  )
}
