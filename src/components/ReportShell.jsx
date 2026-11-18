import { Download, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { periodLabel } from '../lib/analytics'
import { downloadCSV, formatDateTime } from '../lib/format'
import { Button, PageHeader, PeriodPicker } from './ui'

export default function ReportShell({ eyebrow = 'Reports & analytics', title, subtitle, period, onPeriodChange, custom, onCustomChange, rows = [], filename = 'report', filters, children }) {
  const { data } = useStore()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Button icon={Printer} onClick={() => window.print()}>Print / PDF</Button>
            <Button variant="primary" icon={Download} onClick={() => downloadCSV(`${filename}-${new Date().toISOString().slice(0, 10)}.csv`, rows)} disabled={!rows.length}>Export Excel CSV</Button>
          </>
        }
      />

      <Card>
        <div className="grid gap-4 border-b border-line p-4 lg:grid-cols-[auto_1fr] lg:items-center">
          <PeriodPicker period={period} onPeriodChange={onPeriodChange} custom={custom} onCustomChange={onCustomChange} />
          {filters && <div className="flex flex-wrap gap-2 lg:justify-end">{filters}</div>}
        </div>
        <div className="border-b border-line bg-bakery-50/60 px-5 py-3 text-xs text-bakery-900">
          <span className="font-bold">{data.business.name}</span> · {periodLabel(period, custom)} · Generated {formatDateTime(new Date())}
        </div>
        <div className="print-full">{children}</div>
      </Card>
    </div>
  )
}

function Card({ children, className = '' }) {
  return <div className={`card overflow-hidden ${className}`}>{children}</div>
}
