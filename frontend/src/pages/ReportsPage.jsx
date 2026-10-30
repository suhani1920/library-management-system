import { useEffect, useState } from 'react'
import { AlertCircle, ArrowDownToLine, BarChart3, CalendarDays, RefreshCw } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

const today = new Date().toISOString().slice(0, 10)
const monthStart = `${today.slice(0, 7)}-01`
const moneyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

const reportOptions = [
  ['inventory', 'Inventory'],
  ['circulation', 'Circulation'],
  ['overdue', 'Overdue loans'],
  ['financial', 'Fine collection'],
  ['members', 'Member activity'],
  ['popularity', 'Book popularity'],
  ['lost', 'Lost and damaged'],
  ['acquisitions', 'Acquisitions'],
  ['memberships', 'Membership expiry'],
  ['reservations', 'Reservations'],
  ['librarians', 'Librarian activity'],
  ['audit', 'Audit activity'],
]

const columns = {
  inventory: [['book_code', 'Title ID'], ['title', 'Title'], ['isbn13', 'ISBN'], ['copies', 'Copies'], ['available', 'Available'], ['issued', 'Issued'], ['reserved', 'Reserved'], ['unavailable', 'Unavailable']],
  overdue: [['loan_code', 'Loan ID'], ['title', 'Title'], ['full_name', 'Member'], ['member_code', 'Member ID'], ['department', 'Department'], ['due_at', 'Due date'], ['days_overdue', 'Days overdue'], ['barcode', 'Barcode']],
  members: [['member_code', 'Member ID'], ['full_name', 'Member'], ['department', 'Department'], ['loans', 'Loans'], ['active', 'Active'], ['outstanding', 'Outstanding']],
  popularity: [['title', 'Title'], ['book_code', 'Title ID'], ['issues', 'Issues']],
  lost: [['copy_code', 'Copy ID'], ['barcode', 'Barcode'], ['title', 'Title'], ['availability_status', 'Availability'], ['condition_code', 'Condition'], ['notes', 'Notes']],
  acquisitions: [['copy_code', 'Copy ID'], ['title', 'Title'], ['acquisition_date', 'Acquired'], ['acquisition_source', 'Source'], ['purchase_cost', 'Cost']],
  memberships: [['member_code', 'Member ID'], ['full_name', 'Member'], ['email', 'Email'], ['expires_at', 'Expires'], ['status', 'Status']],
  reservations: [['reservation_code', 'Reservation'], ['title', 'Title'], ['full_name', 'Member'], ['status', 'Status'], ['reserved_at', 'Placed'], ['pickup_deadline_at', 'Pickup deadline']],
  librarians: [['full_name', 'Staff member'], ['issued', 'Issued'], ['returned', 'Returned']],
  audit: [['created_at', 'Timestamp'], ['full_name', 'Actor'], ['action', 'Action'], ['entity_type', 'Record type'], ['entity_id', 'Record ID']],
}

const rowsFor = (type, data) => {
  if (type === 'inventory') return data?.rows || []
  if (type === 'circulation') return data?.daily || []
  if (type === 'financial') return data?.collected || []
  if (type === 'audit') return data?.items || []
  return Array.isArray(data) ? data : []
}

function displayValue(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (['outstanding', 'purchase_cost', 'amount'].includes(key)) return moneyFormat.format(Number(value) || 0)
  if (['due_at', 'acquisition_date', 'expires_at', 'reserved_at', 'pickup_deadline_at', 'created_at', 'd'].includes(key)) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : dateFormat.format(date)
  }
  return String(value)
}

export function ReportsPage() {
  const { user } = useAuth()
  const [type, setType] = useState('circulation')
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [request, setRequest] = useState({ key: '', data: null, error: '' })
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([type, from, to, retry])
  const loading = request.key !== key
  const data = request.key === key ? request.data : null
  const error = request.key === key ? request.error : ''
  const rows = rowsFor(type, data)

  useEffect(() => {
    let active = true
    api.get(`/reports/${type}`, { params: { from, to } })
      .then(({ data: response }) => { if (active) setRequest({ key, data: response.data, error: '' }) })
      .catch((requestError) => { if (active) setRequest({ key, data: null, error: requestError.response?.data?.error?.message || 'Report could not be loaded.' }) })
    return () => { active = false }
  }, [key, type, from, to])

  async function exportCsv() {
    try {
      const { data: file } = await api.get(`/reports/${type}`, { params: { from, to, format: 'csv' }, responseType: 'blob' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(file)
      link.href = url
      link.download = `${type}-report-${from}-to-${to}.csv`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('Report exported')
    } catch (exportError) {
      toast.error(exportError.response?.data?.error?.message || 'Report export failed.')
    }
  }

  function applyDateRange(event) {
    event.preventDefault()
    if (from > to) {
      toast.error('Start date must be on or before end date')
      return
    }
    setRetry((value) => value + 1)
  }

  return <div className="page-enter">
    <div className="page-heading"><div><span className="eyebrow">LIBRARY INTELLIGENCE</span><h1>Reports & analytics</h1><p>Operational and collection reports generated from current library records.</p></div><div className="heading-actions"><button className="secondary-button" onClick={exportCsv} disabled={loading || !data}><ArrowDownToLine size={15} />Export CSV</button></div></div>
    <section className="report-controls panel">
      <label className="report-type"><span>Report</span><select value={type} onChange={(event) => setType(event.target.value)}>{reportOptions.filter(([value]) => value !== 'financial' || user.permissions?.includes('reports.financial')).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <form className="report-date-range" onSubmit={applyDateRange}><label><span>From</span><input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} /></label><button className="primary-button" type="submit"><CalendarDays size={15} />Apply range</button></form>
      <button className="icon-button report-refresh" title="Refresh report" aria-label="Refresh report" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} /></button>
    </section>
    {error && <div className="banner-error"><AlertCircle size={16} />{error}<button onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {loading ? <div className="loading-state" role="status"><span className="loading-spinner" />Loading report data</div> : data && <>
      <SummaryTiles type={type} data={data} rows={rows} />
      {type === 'circulation' && <CirculationChart rows={rows} />}
      <section className="panel report-table-panel"><div className="panel-heading"><div><span className="eyebrow">{reportOptions.find(([value]) => value === type)?.[1]?.toUpperCase()}</span><h2>{type === 'circulation' ? 'Daily issue activity' : 'Report details'}</h2></div><span className="report-row-count">{rows.length.toLocaleString('en-IN')} rows</span></div>
        {rows.length ? <div className="activity-table-wrap"><ReportTable type={type} rows={rows} /></div> : <div className="report-empty"><BarChart3 size={20} /><strong>No records in this range</strong><span>Try a wider date range or another report.</span></div>}
      </section>
    </>}
  </div>
}

function SummaryTiles({ type, data, rows }) {
  let items = []
  if (type === 'inventory') items = [['Copies', data.totals?.copies], ['Available', data.totals?.available], ['Issued', data.totals?.issued]]
  if (type === 'circulation') items = [['Issues', data.summary?.issued], ['Returns', data.summary?.returned], ['Overdue now', data.summary?.overdue]]
  if (type === 'financial') items = [['Outstanding balance', moneyFormat.format(Number(data.outstanding?.amount) || 0)], ['Open fine records', data.outstanding?.count], ['Waived in range', moneyFormat.format(Number(data.waivers?.amount) || 0)]]
  if (type === 'overdue') items = [['Overdue loans', rows.length], ['Oldest overdue', rows[0]?.days_overdue ? `${rows[0].days_overdue} days` : '—']]
  if (type === 'acquisitions') items = [['Copies acquired', rows.length], ['Recorded spend', moneyFormat.format(rows.reduce((sum, row) => sum + Number(row.purchase_cost || 0), 0))]]
  if (!items.length) items = [['Records', rows.length]]
  return <section className="report-summary-grid">{items.map(([label, value]) => <article className="report-summary" key={label}><span>{label}</span><strong>{value === undefined || value === null ? '—' : typeof value === 'number' ? value.toLocaleString('en-IN') : value}</strong></article>)}</section>
}

function CirculationChart({ rows }) {
  const chartData = rows.map((row) => ({ ...row, label: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(row.d)) }))
  return <section className="panel circulation-chart-panel"><div className="panel-heading"><div><span className="eyebrow">VOLUME OVER TIME</span><h2>Daily circulation</h2></div><div className="chart-legend"><span><i className="legend-issued" />Issued</span><span><i className="legend-returned" />Same-day returns</span></div></div>
    <div className="circulation-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 12, right: 14, left: -18, bottom: 0 }}><CartesianGrid stroke="#edf1ef" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#8b9692', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={20} /><YAxis allowDecimals={false} tick={{ fill: '#8b9692', fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ border: '1px solid #e1e8e5', borderRadius: 4, fontSize: 10 }} /><Line type="monotone" dataKey="issued" name="Issued" stroke="#39877a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /><Line type="monotone" dataKey="returned_same_day" name="Same-day returns" stroke="#9b8052" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></div>
  </section>
}

function ReportTable({ type, rows }) {
  const fields = columns[type] || (rows.length ? Object.keys(rows[0]).slice(0, 8).map((field) => [field, field.replaceAll('_', ' ')]) : [])
  return <table className="data-table report-table"><thead><tr>{fields.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || row.loan_code || row.copy_code || row.member_code || row.reservation_code || `${type}-${index}`}>{fields.map(([key]) => <td key={key}>{displayValue(key, row[key])}</td>)}</tr>)}</tbody></table>
}