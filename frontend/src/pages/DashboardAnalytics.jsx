import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'short' })
const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

function buildCirculation(issued = [], returned = []) {
  const values = new Map()
  for (const row of issued) {
    const date = new Date(row.d).toISOString().slice(0, 10)
    values.set(date, { date, issued: Number(row.n) || 0, returned: 0 })
  }
  for (const row of returned) {
    const date = new Date(row.d).toISOString().slice(0, 10)
    const item = values.get(date) || { date, issued: 0, returned: 0 }
    item.returned = Number(row.n) || 0
    values.set(date, item)
  }
  return [...values.values()].sort((a, b) => a.date.localeCompare(b.date)).map((item) => ({
    ...item,
    label: shortDate.format(new Date(`${item.date}T12:00:00`)),
  }))
}

function buildMonths(rows = []) {
  return rows.map((row) => {
    const month = String(row.month)
    const date = new Date(`${month}-15T12:00:00`)
    return { label: monthFormat.format(date), members: Number(row.n) || 0 }
  })
}

function buildMonthlyTransactions(rows) {
  const months = new Map()
  for (const row of rows) {
    const month = row.date.slice(0, 7)
    const current = months.get(month) || { month, issued: 0, returned: 0 }
    current.issued += row.issued
    current.returned += row.returned
    months.set(month, current)
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((row) => ({
    ...row,
    label: monthFormat.format(new Date(`${row.month}-15T12:00:00`)),
  }))
}

export function DashboardAnalytics({ analytics }) {
  const circulation = buildCirculation(analytics.issued, analytics.returned)
  const transactions = buildMonthlyTransactions(circulation)
  const members = buildMonths(analytics.membershipGrowth)
  const active = (analytics.mostActive || []).slice(0, 5)
  const popular = (analytics.mostBorrowed || []).slice(0, 5)

  return <section className="analytics-section">
    <div className="analytics-header"><div><span className="eyebrow">COLLECTION AND MEMBER TRENDS</span><h2>Library analytics</h2></div><span>Last 90 days</span></div>
    <div className="analytics-charts">
      <article className="panel analytics-chart-panel"><div className="panel-heading"><div><span className="eyebrow">CIRCULATION</span><h2>Issues and returns</h2></div><div className="chart-legend"><span><i className="legend-issued" />Issued</span><span><i className="legend-returned" />Returned</span></div></div><div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={circulation} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}><CartesianGrid stroke="#edf1ef" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#8b9692', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={23} /><YAxis allowDecimals={false} tick={{ fill: '#8b9692', fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ border: '1px solid #e1e8e5', borderRadius: 4, fontSize: 10 }} /><Line type="monotone" dataKey="issued" name="Issued" stroke="#39877a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /><Line type="monotone" dataKey="returned" name="Returned" stroke="#9b8052" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></div>{!circulation.length && <div className="chart-empty">No circulation activity for this period.</div>}</article>
        <article className="panel analytics-chart-panel"><div className="panel-heading"><div><span className="eyebrow">MONTHLY TRANSACTIONS</span><h2>Book issues and returns</h2></div><div className="chart-legend"><span><i className="legend-issued" />Issued</span><span><i className="legend-returned" />Returned</span></div></div><div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={transactions} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}><CartesianGrid stroke="#edf1ef" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#8b9692', fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8b9692', fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ border: '1px solid #e1e8e5', borderRadius: 4, fontSize: 10 }} /><Line type="monotone" dataKey="issued" name="Issued" stroke="#39877a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /><Line type="monotone" dataKey="returned" name="Returned" stroke="#9b8052" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></div>{!transactions.length && <div className="chart-empty">No circulation activity for this period.</div>}</article>
      <article className="panel analytics-chart-panel"><div className="panel-heading"><div><span className="eyebrow">STUDENT ACTIVITY</span><h2>New memberships</h2></div></div><div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={members} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}><CartesianGrid stroke="#edf1ef" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#8b9692', fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8b9692', fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ border: '1px solid #e1e8e5', borderRadius: 4, fontSize: 10 }} /><Bar dataKey="members" name="New members" fill="#568f83" radius={[3, 3, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></div>{!members.length && <div className="chart-empty">Membership history will appear as records are added.</div>}</article>
    </div>
    <div className="analytics-lists">
      <article className="panel"><div className="panel-heading"><div><span className="eyebrow">MOST BORROWED</span><h2>Popular titles</h2></div></div><div className="analytics-list">{popular.map((book, index) => <div className="analytics-row" key={book.id}><span className="rank-index">{String(index + 1).padStart(2, '0')}</span><strong>{book.title}</strong><span>{Number(book.issues) || 0} loans</span></div>)}{!popular.length && <p className="panel-empty">No borrowing data for this period.</p>}</div></article>
      <article className="panel"><div className="panel-heading"><div><span className="eyebrow">STUDENT ACTIVITY</span><h2>Most active members</h2></div></div><div className="analytics-list">{active.map((member, index) => <div className="analytics-row" key={member.member_code}><span className="rank-index">{String(index + 1).padStart(2, '0')}</span><strong>{member.full_name}</strong><span>{Number(member.issues) || 0} loans</span></div>)}{!active.length && <p className="panel-empty">No member activity for this period.</p>}</div></article>
    </div>
  </section>
}