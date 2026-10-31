import { lazy, Suspense, useEffect, useState } from 'react'
import { AlertCircle, ArrowDownRight, ArrowLeft, ArrowRight, Bell, Bookmark, BookOpen, Check, Clock3, Compass, LibraryBig, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth.js'
import { api } from '../services/api.js'

const numberFormat = new Intl.NumberFormat('en-IN')
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const appYear = new Date().getFullYear()
const explainError = (error, fallback) => error.response?.data?.error?.message || error.response?.data?.message || fallback
const count = (value) => numberFormat.format(Number(value) || 0)
const currency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0)
const isOverdue = (loan) => loan.status === 'overdue'
const DashboardAnalytics = lazy(() => import('./DashboardAnalytics.jsx').then((module) => ({ default: module.DashboardAnalytics })))

function PageHeading({ eyebrow, title, description, children }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children && <div className="heading-actions">{children}</div>}</div>
}

function EmptyState({ icon, title, detail, action }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{detail}</p>{action}</div>
}

function PageLoading({ label }) {
  return <div className="loading-state" role="status"><span className="loading-spinner" />{label}</div>
}

function ErrorState({ message, retry }) {
  return <div className="error-state"><span className="empty-icon"><AlertCircle size={21} /></span><strong>We couldn’t load this view</strong><p>{message}</p><button className="secondary-button" onClick={retry}><RefreshCw size={15} /> Try again</button></div>
}

export function LoginPage({ adminOnly = false }) {
  const { user, status, login, logout } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'ready' && user) {
      navigate(adminOnly && user.role === 'super_admin' ? '/admin' : '/', { replace: true })
    }
  }, [adminOnly, navigate, status, user])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const signedInUser = await login({ email, password })
      if (adminOnly && signedInUser.role !== 'super_admin') {
        await logout().catch(() => undefined)
        setError('This sign-in page is for administrators. Use the member sign-in page instead.')
        return
      }
      navigate(adminOnly ? '/admin' : '/', { replace: true })
    }
    catch (loginError) { setError(explainError(loginError, 'Unable to sign in. Check your details and try again.')) }
    finally { setBusy(false) }
  }

  if (status === 'loading') return <div className="full-loading"><span className="loading-spinner" />Connecting to LibraCore</div>
  return <main className="login-screen">
    <section className="login-brand"><div className="login-brand-top"><span className="brand-mark"><LibraryBig size={23} /></span><span>LibraCore</span></div><div className="login-brand-copy"><span className="eyebrow">CAMPUS LIBRARY PLATFORM</span><h1>Every book.<br />Within reach.</h1><p>One calm place to discover, borrow, and care for your university library.</p></div><div className="login-brand-foot"><ShieldCheck size={16} />Secure access for your campus community</div></section>
    <section className="login-panel"><div className="login-form-wrap"><span className="eyebrow">{adminOnly ? 'STAFF ACCESS' : 'WELCOME BACK'}</span><h2>{adminOnly ? 'Administrator sign in' : 'Sign in to LibraCore'}</h2><p className="muted-copy">{adminOnly ? 'Use your provisioned administrator account.' : 'Use your university library account to continue.'}</p>
      <form className="login-form" onSubmit={submit}><label htmlFor="email">University email</label><input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <div className="inline-error" role="alert"><AlertCircle size={16} />{error}</div>}<button className="primary-button login-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button>
      </form><div className="login-links"><Link to="/forgot-password">Forgot password?</Link>{adminOnly ? <Link to="/login">Member login</Link> : <><Link to="/register">Create member account</Link><Link to="/admin/login">Administrator sign-in</Link></>}</div><p className="login-help">Account access is managed by your library administrator.</p></div><span className="login-version">LIBRARY SERVICES · {appYear}</span></section>
  </main>
}

export function DashboardPage() {
  const { user } = useAuth()
  const isMember = user.role === 'member'
  const [response, setResponse] = useState({ key: null, summary: null, analytics: null, error: '' })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    const requests = [api.get('/dashboard/summary')]
    if (!isMember) requests.push(api.get('/dashboard/circulation', { params: { from: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) } }))
    Promise.all(requests).then(([summaryResponse, analyticsResponse]) => {
      if (active) setResponse({ key: retry, summary: summaryResponse.data.data, analytics: analyticsResponse?.data.data || null, error: '' })
    }).catch((requestError) => { if (active) setResponse({ key: retry, summary: null, analytics: null, error: explainError(requestError, 'Dashboard data could not be loaded.') }) })
    return () => { active = false }
  }, [retry, isMember])

  if (response.key === null) return <PageLoading label="Loading your library overview" />
  if (response.error && !response.summary) return <ErrorState message={response.error} retry={() => setRetry((value) => value + 1)} />
  return isMember ? <MemberDashboard summary={response.summary} user={user} /> : <StaffDashboard summary={response.summary} analytics={response.analytics} error={response.error} retry={() => setRetry((value) => value + 1)} />
}

function StaffDashboard({ summary, analytics, error, retry }) {
  const metrics = summary?.metrics || {}
  const cards = [
    ['Active titles', metrics.activeTitles, `${count(metrics.booksAddedThisMonth)} added this month`, <BookOpen key="titles-icon" size={18} />],
    ['Physical copies', metrics.totalCopies, `${count(metrics.availableCopies)} available now`, <LibraryBig key="copies-icon" size={18} />],
    ['On loan', metrics.issuedCopies, `${count(metrics.issuesToday)} issued today`, <ArrowDownRight key="loans-icon" size={18} />],
    ['Active members', metrics.activeMembers, `${count(metrics.returnsToday)} returns today`, <ShieldCheck key="members-icon" size={18} />],
  ]
  return <div className="page-enter"><PageHeading eyebrow="LIBRARY OPERATIONS" title="Good day, team" description="A live view of today’s library activity and collection health."><button className="secondary-button" onClick={retry}><RefreshCw size={16} />Refresh</button></PageHeading>
    {error && <div className="banner-error"><AlertCircle size={16} />{error}</div>}
    <section className="metric-grid" aria-label="Library metrics">{cards.map(([label, value, note, icon], index) => <article className="metric-card" style={{ '--delay': `${index * 55}ms` }} key={label}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong className="metric-value">{count(value)}</strong><span className="metric-note">{note}</span></article>)}</section>
    <section className="operations-grid"><div className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">CIRCULATION</span><h2>Recent activity</h2></div><Link to="/catalogue" className="text-link">Browse catalogue <ArrowRight size={15} /></Link></div>
      <div className="activity-table-wrap"><table className="data-table"><thead><tr><th>Title and member</th><th>Loan ID</th><th>Activity</th><th>Date</th></tr></thead><tbody>{(summary?.recent || []).map((item) => <tr key={item.id}><td><strong className="table-primary">{item.title}</strong><span className="table-secondary">{item.full_name}</span></td><td className="mono-cell">{item.loan_code}</td><td><StatusPill value={item.status} /></td><td>{dateFormat.format(new Date(item.returned_at || item.issued_at))}</td></tr>)}</tbody></table>
        {!summary?.recent?.length && <EmptyState icon={<ActivityIcon />} title="No circulation activity yet" detail="Issue and return transactions will appear here." />}</div></div>
      <div className="panel attention-panel"><div className="panel-heading"><div><span className="eyebrow">NEEDS ATTENTION</span><h2>Overdue loans</h2></div><span className="count-chip">{count(summary?.metrics?.overdueLoans)}</span></div><div className="compact-list">{(summary?.overdueList || []).slice(0, 5).map((item) => <div className="compact-row" key={item.id}><span className="compact-icon danger-icon"><Clock3 size={16} /></span><span className="compact-copy"><strong>{item.title}</strong><small>{item.full_name} · Due {dateFormat.format(new Date(item.due_at))}</small></span></div>)}{!summary?.overdueList?.length && <EmptyState icon={<Check size={20} />} title="All clear" detail="No overdue loans need attention." />}</div>
        {summary?.pickup?.length > 0 && <div className="pickup-note"><Bookmark size={15} /><span><strong>{summary.pickup.length} reservation{summary.pickup.length === 1 ? '' : 's'}</strong> ready for pickup</span></div>}</div></section>
    <section className="dashboard-lower"><LowerStat icon={<Clock3 size={18} />} tone="amber-icon" label="Overdue loans" value={count(metrics.overdueLoans)} /><LowerStat icon={<Bookmark size={18} />} tone="teal-icon" label="Reservations waiting" value={count(metrics.reservationsWaiting)} /><LowerStat icon={<LibraryBig size={18} />} tone="amber-icon" label="Pending fines" value={currency(metrics.outstandingFines)} /><LowerStat icon={<Check size={18} />} tone="green-icon" label="Fines collected" value={currency(metrics.collectedFines)} /></section>
    {analytics && <Suspense fallback={<PageLoading label="Loading library analytics" />}><DashboardAnalytics analytics={analytics} /></Suspense>}
  </div>
}

function ActivityIcon() { return <BookOpen size={20} /> }
function LowerStat({ icon, tone, label, value }) { return <div className="lower-stat"><span className={`lower-icon ${tone}`}>{icon}</span><span><small>{label}</small><strong>{value}</strong></span></div> }
function StatusPill({ value }) { const key = String(value || '').toLowerCase(); const label = { returned: 'Returned', active: 'On loan', overdue: 'Overdue' }[key] || key; return <span className={`status-pill status-${key}`}>{label}</span> }

function MemberDashboard({ summary, user }) {
  const loans = summary?.loans || []
  return (
    <div className="page-enter member-home">
      <PageHeading eyebrow="YOUR LIBRARY" title={`Welcome, ${user.fullName?.split(' ')[0] || 'reader'}`} description="Your borrowing, reservations, and saved reading in one place." />
      <section className="member-summary-row">
        <div className="member-summary-main"><span className="eyebrow">CURRENTLY BORROWED</span><strong>{count(loans.length)} <span>book{loans.length === 1 ? '' : 's'}</span></strong><p>Keep an eye on your due dates to avoid late fees.</p></div>
        <MemberSummary icon={<Clock3 size={18} />} tone="amber-icon" label="Outstanding fines" value={currency(summary?.outstandingFines)} />
        <MemberSummary icon={<Bookmark size={18} />} tone="teal-icon" label="Active reservations" value={count(summary?.reservations?.length)} />
      </section>
      <section className="member-columns">
        <div className="panel">
          <div className="panel-heading"><div><span className="eyebrow">ON YOUR ACCOUNT</span><h2>Current loans</h2></div><Link to="/catalogue" className="text-link">Find a book <ArrowRight size={15} /></Link></div>
          <div className="member-loans">
            {loans.map((loan) => (
              <article className="member-loan-row" key={loan.id}>
                <div className="book-cover-mini"><BookOpen size={20} /></div>
                <div className="member-loan-copy"><strong>{loan.title}</strong><small>Barcode {loan.barcode} · {loan.loan_code}</small></div>
                <div className="due-date"><small>Due date</small><strong className={isOverdue(loan) ? 'overdue-text' : ''}>{dateFormat.format(new Date(loan.due_at))}</strong></div>
              </article>
            ))}
            {!loans.length && <EmptyState icon={<BookOpen size={20} />} title="No books checked out" detail="Explore the catalogue to find your next read." action={<Link className="text-link" to="/catalogue">Browse books <ArrowRight size={15} /></Link>} />}
          </div>
        </div>
        <div className="member-side-stack">
          <div className="panel">
            <div className="panel-heading"><div><span className="eyebrow">WAITLIST</span><h2>Reservations</h2></div></div>
            <div className="compact-list">
              {(summary?.reservations || []).map((item) => <div className="compact-row" key={item.id}><span className="compact-icon teal-icon"><Bookmark size={16} /></span><span className="compact-copy"><strong>{item.title}</strong><small>{item.status === 'ready' ? 'Ready for pickup' : `Queue position ${item.queue_position}`}</small></span></div>)}
              {!summary?.reservations?.length && <p className="panel-empty">No active reservations.</p>}
            </div>
          </div>
          <div className="panel reading-list-panel">
            <div className="panel-heading"><div><span className="eyebrow">FOR LATER</span><h2>Reading list</h2></div></div>
            {(summary?.saved || []).map((book) => <div className="saved-book" key={book.id}><BookOpen size={15} /><span>{book.title}</span></div>)}
            {!summary?.saved?.length && <p className="panel-empty">Books you save will appear here.</p>}
          </div>
        </div>
      </section>
    </div>
  )
}
function MemberSummary({ icon, tone, label, value }) { return <div className="member-summary-side"><span className={`lower-icon ${tone}`}>{icon}</span><span><small>{label}</small><strong>{value}</strong></span></div> }

export function CataloguePage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const page = Number(params.get('page') || 1)
  const [draft, setDraft] = useState({ source: query, value: query })
  const input = draft.source === query ? draft.value : query
  const sortBy = params.get('sortBy') || 'title'
  const availableOnly = params.get('availableOnly') === 'true'
  const [refresh, setRefresh] = useState(0)
  const [checkout, setCheckout] = useState({ book: null, preview: null, busy: false, error: '' })
  const isMember = user.role === 'member'
  const requestKey = JSON.stringify([query, page, sortBy, availableOnly, refresh])
  const [response, setResponse] = useState({ key: null, result: { items: [], total: 0, page: 1, totalPages: 1 }, error: '' })
  const loading = response.key !== requestKey
  const result = response.result
  const pagination = result.pagination || { page: 1, total: 0, totalPages: 1 }
  const error = response.key === requestKey ? response.error : ''
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params)
      if (input.trim()) next.set('q', input.trim())
      else next.delete('q')
      next.delete('page')
      if (next.toString() !== params.toString()) setParams(next, { replace: true })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [input, params, setParams])
  useEffect(() => {
    let active = true
    api.get('/books', { params: { q: query, page, limit: 12, sortBy, sortDir: 'asc', availableOnly: availableOnly ? 'true' : undefined } })
      .then(({ data }) => { if (active) setResponse({ key: requestKey, result: data.data, error: '' }) })
      .catch((requestError) => { if (active) setResponse({ key: requestKey, result: { items: [], pagination: { page, total: 0, totalPages: 1 } }, error: explainError(requestError, 'Catalogue results could not be loaded.') }) })
    return () => { active = false }
  }, [query, page, sortBy, availableOnly, requestKey, refresh])

  function changePage(nextPage) { const next = new URLSearchParams(params); if (nextPage > 1) next.set('page', String(nextPage)); else next.delete('page'); setParams(next) }
  function changeAvailability(checked) { const next = new URLSearchParams(params); if (checked) next.set('availableOnly', 'true'); else next.delete('availableOnly'); next.delete('page'); setParams(next) }
  function changeSort(value) { const next = new URLSearchParams(params); next.set('sortBy', value); setParams(next) }

  async function previewBorrow(book) {
    setCheckout({ book, preview: null, busy: true, error: '' })
    try {
      const { data } = await api.post('/loans/self-preview', { bookId: Number(book.id) })
      setCheckout({ book, preview: data.data, busy: false, error: '' })
    } catch (requestError) {
      setCheckout({ book, preview: null, busy: false, error: explainError(requestError, 'This title cannot be borrowed from your home branch right now.') })
    }
  }

  async function confirmBorrow() {
    if (!checkout.book || !checkout.preview?.eligible) return
    setCheckout((current) => ({ ...current, busy: true, error: '' }))
    try {
      const { data } = await api.post('/loans/self-issue', { bookId: Number(checkout.book.id) })
      toast.success(`${data.data.title} borrowed. Due ${dateFormat.format(new Date(data.data.dueAt))}.`)
      setCheckout({ book: null, preview: null, busy: false, error: '' })
      setRefresh((value) => value + 1)
    } catch (requestError) {
      setCheckout((current) => ({ ...current, busy: false, error: explainError(requestError, 'The copy could not be issued. Recheck availability and eligibility.') }))
    }
  }

  async function reserveBook(book) {
    try {
      const { data } = await api.post('/reservations', { bookId: Number(book.id) })
      toast.success(`Reservation placed. Queue position ${data.data.queuePosition}.`)
    } catch (requestError) { toast.error(explainError(requestError, 'Reservation could not be placed.')) }
  }

  return <div className="page-enter"><PageHeading eyebrow="DISCOVER" title="Library catalogue" description="Find a title, author, or subject across the campus collection." />
    <div className="catalogue-toolbar"><label className="catalogue-search"><Search size={18} /><input value={input} onChange={(event) => setDraft({ source: query, value: event.target.value })} placeholder="Search by title, author, ISBN, or keyword" aria-label="Search catalogue" />{input && <button className="clear-search icon-button" onClick={() => setDraft({ source: query, value: '' })} aria-label="Clear search"><X size={16} /></button>}</label>
      <div className="catalogue-controls"><label className="available-toggle"><input type="checkbox" checked={availableOnly} onChange={(event) => changeAvailability(event.target.checked)} /><span className="toggle-track" /><span>Available now</span></label><label className="sort-select"><span>Sort by</span><select value={sortBy} onChange={(event) => changeSort(event.target.value)}><option value="title">Title</option><option value="publicationYear">Publication year</option><option value="popularity">Popularity</option><option value="availability">Availability</option></select></label></div>
    </div>
    <div className="results-line"><span>{loading ? 'Searching collection…' : `${count(pagination.total)} ${Number(pagination.total) === 1 ? 'title' : 'titles'}`}{query && !loading ? ` for “${query}”` : ''}</span>{query && <button className="filter-chip" onClick={() => { setDraft({ source: query, value: '' }); setParams({}) }}>{query}<X size={13} /></button>}</div>
    {error && <div className="banner-error"><AlertCircle size={16} />{error}<button onClick={() => setParams(new URLSearchParams(params))}>Retry</button></div>}
    {loading ? <CatalogueSkeleton /> : result.items?.length ? <><section className="book-grid" aria-label="Catalogue results">{result.items.map((book, index) => <BookCard key={book.id} book={book} index={index} isMember={isMember} onBorrow={previewBorrow} onReserve={reserveBook} />)}</section><div className="pagination-bar"><span>Page {pagination.page} of {pagination.totalPages}</span><div><button className="icon-button pagination-button" aria-label="Previous page" disabled={page <= 1} onClick={() => changePage(page - 1)}><ArrowLeft size={17} /></button><button className="icon-button pagination-button" aria-label="Next page" disabled={page >= pagination.totalPages} onClick={() => changePage(page + 1)}><ArrowRight size={17} /></button></div></div></> : !error && <EmptyState icon={<Compass size={22} />} title="No titles found" detail={query ? 'Try a different title, author name, or search term.' : 'The catalogue has no active titles yet.'} action={query && <button className="text-link" onClick={() => { setDraft({ source: query, value: '' }); setParams({}) }}>Clear search <X size={14} /></button>} />}
    {checkout.book && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !checkout.busy) setCheckout({ book: null, preview: null, busy: false, error: '' }) }}><section className="modal-panel checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div className="modal-header"><div><span className="eyebrow">MEMBER CHECKOUT</span><h2 id="checkout-title">Borrow this title</h2></div><button className="icon-button" onClick={() => setCheckout({ book: null, preview: null, busy: false, error: '' })} aria-label="Close checkout"><X size={18} /></button></div><div className="checkout-body"><strong>{checkout.book.title}</strong>{checkout.busy && !checkout.preview ? <div className="loading-state"><span className="loading-spinner" />Checking your account and copy availability</div> : checkout.error ? <div className="banner-error"><AlertCircle size={16} />{checkout.error}</div> : checkout.preview && <><div className={`eligibility-banner ${checkout.preview.eligible ? 'eligible' : 'ineligible'}`}><span>{checkout.preview.eligible ? <Check size={16} /> : <AlertCircle size={16} />}</span><div><strong>{checkout.preview.eligible ? 'Ready to borrow' : 'Borrowing not available'}</strong><small>{checkout.preview.reasons?.length ? checkout.preview.reasons.join(' · ') : `${checkout.preview.policy.loanPeriodDays} day loan period`}</small></div></div><div className="checkout-due">Due date <strong>{dateFormat.format(new Date(checkout.preview.dueAt))}</strong></div></>}{checkout.error && Number(checkout.book.available_copies) <= 0 && <button className="secondary-button" onClick={() => { reserveBook(checkout.book); setCheckout({ book: null, preview: null, busy: false, error: '' }) }}>Place reservation</button>}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setCheckout({ book: null, preview: null, busy: false, error: '' })}>Cancel</button><button className="primary-button" onClick={confirmBorrow} disabled={checkout.busy || !checkout.preview?.eligible}>{checkout.busy ? 'Processing…' : 'Confirm borrow'}</button></div></section></div>}
  </div>
}

function BookCard({ book, index, isMember, onBorrow, onReserve }) {
  const category = book.categories?.split(',')[0]
  return <article className="book-card" style={{ '--delay': `${Math.min(index, 9) * 35}ms` }}><div className={`book-art book-art-${index % 5}`}>{book.cover_image_path ? <img src={book.cover_image_path} alt={`Cover of ${book.title}`} /> : <><span className="book-art-rule" /><BookOpen size={25} /><span className="book-art-label">CAMPUS<br />COLLECTION</span></>}</div><div className="book-card-info"><div className="book-tags">{category && <span>{category}</span>}<span>{book.publication_year || 'Edition not listed'}</span></div><h2>{book.title}</h2><p className="book-author">{book.authors || 'Author not listed'}</p><div className="book-card-bottom"><span className={`availability ${Number(book.available_copies) > 0 ? 'is-available' : 'is-unavailable'}`}><span />{Number(book.available_copies) > 0 ? `${count(book.available_copies)} available` : 'Currently unavailable'}</span><span className="copy-total">of {count(book.copy_count)} copies</span></div>{isMember && <div className="book-member-actions">{Number(book.available_copies) > 0 ? <button className="primary-button" onClick={() => onBorrow(book)}>Borrow</button> : <button className="secondary-button" onClick={() => onReserve(book)}>Reserve</button>}</div>}</div></article>
}

function CatalogueSkeleton() { return <div className="book-grid" aria-label="Loading catalogue">{Array.from({ length: 8 }, (_, index) => <div className="book-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div> }

export function NotificationsPage() {
  const [response, setResponse] = useState({ key: null, items: [], error: '' })
  const [retry, setRetry] = useState(0)
  const loading = response.key !== retry
  const error = response.key === retry ? response.error : ''
  const items = response.items
  useEffect(() => {
    let active = true
    api.get('/notifications').then(({ data }) => { if (active) setResponse({ key: retry, items: data.data || [], error: '' }) })
      .catch((requestError) => { if (active) setResponse({ key: retry, items: [], error: explainError(requestError, 'Notifications could not be loaded.') }) })
    return () => { active = false }
  }, [retry])
  async function markRead(id) {
    try { await api.patch(`/notifications/${id}/read`); setItems((current) => current.map((item) => item.id === id ? { ...item, is_read: 1 } : item)) }
    catch (requestError) { toast.error(explainError(requestError, 'Could not update notification.')) }
  }
  async function markAllRead() {
    try { await api.post('/notifications/read-all'); setResponse((current) => ({ ...current, items: current.items.map((item) => ({ ...item, is_read: 1 })) })); toast.success('All notifications marked as read') }
    catch (requestError) { toast.error(explainError(requestError, 'Could not update notifications.')) }
  }
  return <div className="page-enter"><PageHeading eyebrow="INBOX" title="Notifications" description="Updates about loans, reservations, and your library account.">{items.some((item) => !item.is_read) && <button className="secondary-button" onClick={markAllRead}><Check size={16} />Mark all read</button>}</PageHeading>
    {error && <div className="banner-error"><AlertCircle size={16} />{error}<button onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {loading ? <PageLoading label="Loading notifications" /> : <section className="notification-list">{items.map((item) => <article className={`notification-item ${item.is_read ? '' : 'notification-unread'}`} key={item.id}><span className="notification-icon"><Bell size={17} /></span><div className="notification-copy"><div className="notification-title-row"><h2>{item.title}</h2>{!item.is_read && <span className="unread-dot" />}</div><p>{item.body}</p><time>{formatDateTime(item.created_at)}</time></div>{!item.is_read && <button className="notification-action" onClick={() => markRead(item.id)}>Mark read</button>}</article>)}{!items.length && <EmptyState icon={<Bell size={21} />} title="You’re all caught up" detail="Library updates will show here when they arrive." />}</section>}
  </div>
}

function formatDateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `${dateFormat.format(date)} · ${new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(date)}` }