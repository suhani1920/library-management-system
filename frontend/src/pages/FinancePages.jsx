import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, BookOpen, Check, CreditCard, ReceiptText, RefreshCw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth.js'
import { api } from '../services/api.js'

const moneyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const count = (value) => new Intl.NumberFormat('en-IN').format(Number(value) || 0)
const messageFor = (error, fallback) => error.response?.data?.error?.message || error.response?.data?.message || fallback

function PageHeading({ eyebrow, title, description, children }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children && <div className="heading-actions">{children}</div>}</div>
}

function Loading({ label }) { return <div className="loading-state" role="status"><span className="loading-spinner" />{label}</div> }

function Status({ value }) { return <span className={`status-pill status-${value}`}>{value}</span> }

export function ReservationsPage() {
  const { user } = useAuth()
  const isMember = user.role === 'member'
  const [status, setStatus] = useState('')
  const [state, setState] = useState({ key: '', items: [], pagination: null, error: '' })
  const [search, setSearch] = useState('')
  const [searchResult, setSearchResult] = useState({ query: '', items: [] })
  const matches = searchResult.query === search ? searchResult.items : []
  const [selectedBook, setSelectedBook] = useState(null)
  const [memberProfileId, setMemberProfileId] = useState('')
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([status, retry])
  const loading = state.key !== key
  const items = state.key === key ? state.items : []
  const error = state.key === key ? state.error : ''

  useEffect(() => {
    let active = true
    api.get('/reservations', { params: { status: status || undefined, page: 1, limit: 50 } })
      .then(({ data }) => { if (active) setState({ key, items: data.data.items, pagination: data.data.pagination, error: '' }) })
      .catch((requestError) => { if (active) setState({ key, items: [], pagination: null, error: messageFor(requestError, 'Reservations could not be loaded.') }) })
    return () => { active = false }
  }, [key, status, retry])

  useEffect(() => {
    if (search.trim().length < 2) return undefined
    let active = true
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const { data } = await api.get('/books', { params: { q: search.trim(), limit: 8 } })
        if (active) setSearchResult({ query: search, items: data.data.items || [] })
      } catch { if (active) setSearchResult({ query: search, items: [] }) }
      finally { if (active) setSearching(false) }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [search])

  async function createReservation(event) {
    event.preventDefault()
    if (!selectedBook) return
    setBusy(true)
    try {
      await api.post('/reservations', {
        bookId: selectedBook.id,
        branchId: user.branchId,
        ...(isMember ? {} : { memberProfileId: Number(memberProfileId) }),
      })
      toast.success(`Reservation placed for ${selectedBook.title}`)
      setSelectedBook(null); setSearch(''); setMemberProfileId(''); setSearchResult({ query: '', items: [] }); setRetry((value) => value + 1)
    } catch (requestError) { toast.error(messageFor(requestError, 'Reservation could not be placed.')) }
    finally { setBusy(false) }
  }

  async function cancelReservation(item) {
    try {
      await api.post(`/reservations/${item.id}/cancel`)
      toast.success('Reservation cancelled')
      setRetry((value) => value + 1)
    } catch (requestError) { toast.error(messageFor(requestError, 'Reservation could not be cancelled.')) }
  }

  return <div className="page-enter"><PageHeading eyebrow="COLLECTION QUEUE" title="Reservations" description={isMember ? 'Track your place in the queue and cancel reservations you no longer need.' : 'Monitor the waitlist and pickup windows across the library.'} />
    <section className="reservation-create panel"><div className="panel-heading"><div><span className="eyebrow">NEW REQUEST</span><h2>Reserve a title</h2></div></div><form className="reservation-form" onSubmit={createReservation}><div className="book-picker"><label htmlFor="reservation-book">Search catalogue</label><div className="directory-search"><Search size={16} /><input id="reservation-book" value={selectedBook?.title || search} onChange={(event) => { setSelectedBook(null); setSearch(event.target.value) }} placeholder="Type a title or author" autoComplete="off" />{searching && <span className="picker-spinner" />}</div>{matches.length > 0 && !selectedBook && <div className="book-suggestions" role="listbox">{matches.map((book) => <button type="button" role="option" key={book.id} onClick={() => { setSelectedBook(book); setSearch(''); setMatches([]) }}><BookOpen size={15} /><span><strong>{book.title}</strong><small>{book.authors || 'Author not listed'} · {book.available_copies} available</small></span></button>)}</div>}</div>
      {!isMember && <label className="member-id-input">Member profile ID<input type="number" min="1" value={memberProfileId} onChange={(event) => setMemberProfileId(event.target.value)} placeholder="Profile ID" required /></label>}
      <button className="primary-button reservation-submit" disabled={busy || !selectedBook}>{busy ? 'Placing request…' : 'Place reservation'}<ArrowRight size={15} /></button></form></section>
    <section className="panel reservation-list-panel"><div className="panel-heading"><div><span className="eyebrow">CURRENT AND PAST</span><h2>Reservation history</h2></div><div className="list-controls"><select aria-label="Filter by reservation status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="queued">Queued</option><option value="ready">Ready for pickup</option><option value="fulfilled">Fulfilled</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option></select><button className="icon-button" aria-label="Refresh reservations" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} /></button></div></div>
      {error && <div className="banner-error"><AlertCircle size={16} />{error}<button onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
      {loading ? <Loading label="Loading reservations" /> : <div className="activity-table-wrap"><table className="data-table"><thead><tr>{!isMember && <th>Member</th>}<th>Title</th><th>Reservation</th><th>Queue</th><th>Pickup deadline</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>{!isMember && <td><strong className="table-primary">{item.full_name}</strong><span className="table-secondary">{item.member_code}</span></td>}<td><strong className="table-primary">{item.title}</strong></td><td className="mono-cell">{item.reservation_code}</td><td>{item.status === 'queued' ? count(item.queue_position) : '—'}</td><td>{item.pickup_deadline_at ? dateFormat.format(new Date(item.pickup_deadline_at)) : '—'}</td><td><Status value={item.status} /></td><td>{['queued', 'ready'].includes(item.status) && <button className="text-action" onClick={() => cancelReservation(item)}>Cancel</button>}</td></tr>)}</tbody></table>{!items.length && <div className="directory-empty"><BookOpen size={20} /><strong>No reservations</strong><span>Requests and waitlist activity will appear here.</span></div>}</div>}</section>
  </div>
}

export function FinesPage() {
  const { user } = useAuth()
  const permissions = user.permissions || []
  const [state, setState] = useState({ key: null, items: [], pagination: null, summary: null, error: '' })
  const [retry, setRetry] = useState(0)
  const [paymentFine, setPaymentFine] = useState(null)
  const [waiverFine, setWaiverFine] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [busy, setBusy] = useState(false)
  const key = String(retry)
  const loading = state.key !== key
  const items = state.key === key ? state.items : []
  const error = state.key === key ? state.error : ''

  useEffect(() => {
    let active = true
    api.get('/fines', { params: { page: 1, limit: 50 } })
      .then(({ data }) => { if (active) setState({ key, items: data.data.items, pagination: data.data.pagination, summary: data.data.summary, error: '' }) })
      .catch((requestError) => { if (active) setState({ key, items: [], pagination: null, summary: null, error: messageFor(requestError, 'Fine records could not be loaded.') }) })
    return () => { active = false }
  }, [key, retry])

  async function submitPayment(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('amount'))
    setBusy(true)
    try {
      const { data } = await api.post('/payments', {
        memberProfileId: Number(paymentFine.member_profile_id),
        amount,
        method: form.get('method'),
        notes: form.get('notes') || undefined,
        allocations: [{ fineId: paymentFine.id, amount }],
      })
      const receiptFallback = {
        payment_code: data.data.paymentCode,
        amount: data.data.amount,
        full_name: paymentFine.full_name,
        member_code: paymentFine.member_code,
        paid_at: new Date().toISOString(),
        method: form.get('method'),
      }
      setPaymentFine(null)
      setRetry((value) => value + 1)
      try {
        const receiptResponse = await api.get(`/payments/${data.data.paymentId}/receipt`)
        setReceipt(receiptResponse.data.data)
      } catch {
        setReceipt(receiptFallback)
        toast.info('Payment was recorded; detailed receipt data could not be loaded.')
      }
      toast.success(`Payment ${data.data.paymentCode} recorded`)
    } catch (requestError) { toast.error(messageFor(requestError, 'Payment could not be recorded.')) }
    finally { setBusy(false) }
  }

  async function submitWaiver(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('amount'))
    const reason = String(form.get('reason') || '')
    setBusy(true)
    try {
      await api.post(`/fines/${waiverFine.id}/waive`, { amount, reason })
      toast.success('Fine waiver recorded')
      setWaiverFine(null)
      setRetry((value) => value + 1)
    } catch (requestError) { toast.error(messageFor(requestError, 'Fine waiver could not be recorded.')) }
    finally { setBusy(false) }
  }

  return <div className="page-enter"><PageHeading eyebrow="FINE LEDGER" title="Fines & payments" description={permissions.includes('payments.record') ? 'Review balances and record payments received through approved offline channels.' : 'Review your outstanding balance and fine history.'}><button className="icon-button" aria-label="Refresh fines" title="Refresh" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} /></button></PageHeading>
    {permissions.includes('payments.record') && <div className="manual-payment-note"><CreditCard size={16} /><span>Manual ledger entry only. No online payment provider is configured.</span></div>}
    {error && <div className="banner-error"><AlertCircle size={16} />{error}<button onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    <section className="fine-overview"><div><span>Outstanding balance</span><strong>{moneyFormat.format(Number(state.summary?.outstandingAmount) || 0)}</strong></div><div><span>Open records</span><strong>{count(state.summary?.openRecords)}</strong></div><div><span>Fine history</span><strong>{count(state.summary?.totalRecords)}</strong></div></section>
    <section className="panel fine-table-panel"><div className="panel-heading"><div><span className="eyebrow">ACCOUNT LEDGER</span><h2>{user.role === 'member' ? 'Your fines' : 'Member fine records'}</h2></div></div>
      {loading ? <Loading label="Loading fine ledger" /> : <div className="activity-table-wrap"><table className="data-table fine-table"><thead><tr>{user.role !== 'member' && <th>Member</th>}<th>Fine reference</th><th>Reason</th><th>Created</th><th>Original amount</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map((fine) => <tr key={fine.id}>{user.role !== 'member' && <td><strong className="table-primary">{fine.full_name}</strong><span className="table-secondary">{fine.member_code}</span></td>}<td className="mono-cell">{fine.fine_code}</td><td><strong className="table-primary">{fine.reason || fine.fine_type}</strong></td><td>{dateFormat.format(new Date(fine.created_at))}</td><td>{moneyFormat.format(Number(fine.amount) || 0)}</td><td><strong>{moneyFormat.format(Number(fine.outstanding_amount) || 0)}</strong></td><td><Status value={fine.status} /></td><td><div className="table-actions">{permissions.includes('payments.record') && Number(fine.outstanding_amount) > 0 && <button className="text-action" onClick={() => setPaymentFine(fine)}>Record payment</button>}{permissions.includes('fines.manage') && Number(fine.outstanding_amount) > 0 && <button className="text-action" onClick={() => setWaiverFine(fine)}>Waive</button>}</div></td></tr>)}</tbody></table>{!items.length && <div className="directory-empty"><Check size={20} /><strong>No fine records</strong><span>Outstanding charges and payment history will appear here.</span></div>}</div>}
    </section>
    {paymentFine && <Modal title="Record a payment" eyebrow="MANUAL RECEIPT" close={() => setPaymentFine(null)}><form className="record-form" onSubmit={submitPayment}><p className="form-note">This records money already received by the library. It does not charge a card or contact a payment gateway.</p><div className="payment-member"><strong>{paymentFine.full_name}</strong><span>{paymentFine.fine_code} · Balance {moneyFormat.format(Number(paymentFine.outstanding_amount))}</span></div><label>Amount received (INR)<input name="amount" type="number" min="0.01" max={Number(paymentFine.outstanding_amount)} step="0.01" defaultValue={paymentFine.outstanding_amount} required /></label><label>Method<select name="method" defaultValue="cash"><option value="cash">Cash</option><option value="upi">UPI received</option><option value="card">Card terminal received</option><option value="other">Other approved method</option></select></label><label>Receipt note<textarea name="notes" rows="2" maxLength="500" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPaymentFine(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Recording…' : 'Record receipt'}</button></div></form></Modal>}
    {waiverFine && <Modal title="Approve a fine waiver" eyebrow="AUTHORIZED ADJUSTMENT" close={() => setWaiverFine(null)}><form className="record-form" onSubmit={submitWaiver}><div className="payment-member"><strong>{waiverFine.full_name}</strong><span>{waiverFine.fine_code} · Balance {moneyFormat.format(Number(waiverFine.outstanding_amount))}</span></div><label>Waiver amount (INR)<input name="amount" type="number" min="0.01" max={Number(waiverFine.outstanding_amount)} step="0.01" defaultValue={waiverFine.outstanding_amount} required /></label><label>Reason for waiver<textarea name="reason" rows="3" minLength="3" maxLength="500" required /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setWaiverFine(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Approve waiver'}</button></div></form></Modal>}
    {receipt && <Modal title="Payment receipt" eyebrow={receipt.payment_code} close={() => setReceipt(null)}><div className="receipt-content"><ReceiptText size={28} /><h3>{moneyFormat.format(Number(receipt.amount))}</h3><p>Recorded for {receipt.full_name} on {dateFormat.format(new Date(receipt.paid_at))}</p><div className="receipt-meta"><span>Method</span><strong>{receipt.method}</strong><span>Member ID</span><strong>{receipt.member_code}</strong></div><button className="secondary-button" onClick={() => window.print()}><ReceiptText size={15} />Print receipt</button></div></Modal>}
  </div>
}

function Modal({ eyebrow, title, close, children }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="finance-modal-title"><div className="modal-header"><div><span className="eyebrow">{eyebrow}</span><h2 id="finance-modal-title">{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div>
}