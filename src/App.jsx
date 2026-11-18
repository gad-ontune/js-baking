import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/inventory/Inventory'
import InventoryCategories from './pages/inventory/Categories'
import StockMovements from './pages/inventory/StockMovements'
import LowStock from './pages/inventory/LowStock'
import ExpiryTracking from './pages/inventory/ExpiryTracking'
import Purchases from './pages/purchases/Purchases'
import Suppliers from './pages/purchases/Suppliers'
import SupplierBalances from './pages/purchases/SupplierBalances'
import Production from './pages/production/Production'
import Sales from './pages/sales/Sales'
import Expenses from './pages/sales/Expenses'
import Notifications from './pages/Notifications'
import FinancialReport from './pages/reports/FinancialReport'
import InventoryReport from './pages/reports/InventoryReport'
import PurchaseReport from './pages/reports/PurchaseReport'
import ProductPerformance from './pages/reports/ProductPerformance'
import ProductionReport from './pages/reports/ProductionReport'
import BusinessProfile from './pages/settings/BusinessProfile'
import Users from './pages/settings/Users'
import Configuration from './pages/settings/Configuration'
import AuditHistory from './pages/settings/Audit'
import { useStore } from './lib/store'
import { Button, Card, EmptyState } from './components/ui'

function RequireAuth({ children }) {
  const { currentUser } = useStore()
  const location = useLocation()
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

function RequirePermission({ permission, children }) {
  const { can } = useStore()
  if (!can(permission)) return <AccessDenied />
  return children
}

function AccessDenied() {
  return (
    <Card className="mx-auto max-w-xl p-6">
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this area"
        description="Your current role does not include permission for this module. Contact the bakery owner if you need access."
        action={<Link to="/dashboard"><Button variant="primary">Back to dashboard</Button></Link>}
      />
    </Card>
  )
}

function NotFound() {
  return (
    <Card className="mx-auto max-w-xl p-6">
      <EmptyState title="Page not found" description="The page you are looking for does not exist." action={<Link to="/dashboard"><Button variant="primary">Go to dashboard</Button></Link>} />
    </Card>
  )
}

const guard = (permission, element) => <RequirePermission permission={permission}>{element}</RequirePermission>

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={<RequireAuth><Layout /></RequireAuth>}
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={guard('dashboard.view', <Dashboard />)} />
        <Route path="notifications" element={<Notifications />} />

        <Route path="inventory" element={guard('inventory.view', <Inventory />)} />
        <Route path="inventory/categories" element={guard('inventory.view', <InventoryCategories />)} />
        <Route path="inventory/movements" element={guard('inventory.view', <StockMovements />)} />
        <Route path="inventory/low-stock" element={guard('inventory.view', <LowStock />)} />
        <Route path="inventory/expiry" element={guard('inventory.view', <ExpiryTracking />)} />

        <Route path="purchases" element={guard('purchases.view', <Purchases />)} />
        <Route path="purchases/suppliers" element={guard('suppliers.view', <Suppliers />)} />
        <Route path="purchases/balances" element={guard('purchases.view', <SupplierBalances />)} />

        <Route path="production" element={guard('production.view', <Production />)} />
        <Route path="sales" element={guard('sales.view', <Sales />)} />
        <Route path="expenses" element={guard('expenses.view', <Expenses />)} />

        <Route path="reports/financial" element={guard('reports.basic', <FinancialReport />)} />
        <Route path="reports/inventory" element={guard('reports.basic', <InventoryReport />)} />
        <Route path="reports/purchases" element={guard('reports.basic', <PurchaseReport />)} />
        <Route path="reports/products" element={guard('reports.basic', <ProductPerformance />)} />
        <Route path="reports/production" element={guard('reports.basic', <ProductionReport />)} />

        <Route path="settings/business" element={guard('settings.view', <BusinessProfile />)} />
        <Route path="settings/users" element={guard('settings.view', <Users />)} />
        <Route path="settings/configuration" element={guard('settings.view', <Configuration />)} />
        <Route path="settings/audit" element={guard('settings.view', <AuditHistory />)} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
