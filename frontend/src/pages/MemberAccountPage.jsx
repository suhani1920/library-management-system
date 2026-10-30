import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, BookOpen, Bookmark, Clock3, KeyRound, RefreshCw, Save, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../services/api.js'

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
const moneyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

export function MemberAccountPage() {
  const [response, setResponse] = useState({ key: null, profile: null, dashboard: null, error: '' })
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const [passwordMessage, setPasswordMessage] = useState('')

  const loading = response.key !== retry
  const profile = response.key === retry ? response.profile : null
  const dashboard = response.key === retry ? response.dashboard : null
  const error = response.key === retry ? response.error : ''

  useEffect(() => {
    let active = true
    Promise.all([api.get('/members/me'), api.get('/dashboard/summary')])
      .then(([profileResponse, dashboardResponse]) => {
        if (active) {
          setResponse({ key: retry, profile: profileResponse.data.data, dashboard: dashboardResponse.data.data, error: '' })
        }
      })
      .catch((requestError) => { if (active) setResponse({ key: retry, profile: null, dashboard: null, error: requestError.response?.data?.error?.message || 'Your account could not be loaded.' }) })
    return () => { active = false }
  }, [retry])

  async function saveProfile(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form.entries())
    setBusy(true)
    try {
      await api.patch(`/members/${profile.id}`, payload)
      toast.success('Profile details saved')
      setRetry((value) => value + 1)
    } catch (requestError) { toast.error(requestError.response?.data?.error?.message || 'Profile changes could not be saved.') }
    finally { setBusy(false) }
  }

  async function renew(loan) {
    try {
      await api.post(`/loans/${loan.id}/renew`)
      toast.success(`${loan.title} renewed`)
      setRetry((value) => value + 1)
    } catch (requestError) { toast.error(requestError.response?.data?.error?.message || 'This loan is not eligible for renewal.') }
  }

  async function cancelReservation(reservation) {
    try {
      await api.post(`/reservations/${reservation.id}/cancel`)
      toast.success('Reservation cancelled')
      setRetry((value) => value + 1)
    } catch (requestError) { toast.error(requestError.response?.data?.error?.message || 'Reservation could not be cancelled.') }
  }

  async function toggleSaved(book) {
    try {
      await api.post(`/books/${book.id}/reading-list`)
      setRetry((value) => value + 1)
      toast.success('Reading list updated')
    } catch (requestError) { toast.error(requestError.response?.data?.error?.message || 'Reading list could not be updated.') }
  }

  async function changePassword(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const currentPassword = String(form.get('currentPassword'))
    const newPassword = String(form.get('newPassword'))
    const confirmation = String(form.get('confirmPassword'))
    if (newPassword !== confirmation) { setPasswordMessage('The new passwords do not match.'); return }
    if (newPassword.length < 10) { setPasswordMessage('Use at least 10 characters for your new password.'); return }
    setBusy(true); setPasswordMessage('')
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword })
      formElement.reset()
      setPasswordMessage('Password updated. Sign in again on your other devices.')
      toast.success('Password changed')
    } catch (requestError) { setPasswordMessage(requestError.response?.data?.error?.message || 'Password could not be changed.') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="loading-state" role="status"><span className="loading-spinner" />Loading your account</div>
  if (error || !profile) return <div className="error-state"><span className="empty-icon"><AlertCircle size={20} /></span><strong>Account unavailable</strong><p>{error || 'No member profile is linked to this account.'}</p><button className="secondary-button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={15} />Retry</button></div>

  const membership = profile.memberships?.[0]
  const loans = profile.loans || []
  const reservations = profile.reservations || []
  const saved = dashboard?.saved || []

  return <div className="page-enter">
    <div className="page-heading"><div><span className="eyebrow">MEMBER ACCOUNT</span><h1>Your library account</h1><p>Manage your profile, borrowing, reservations, and saved titles.</p></div><div className="member-code-chip"><UserRound size={15} />{profile.member_code}</div></div>
    <section className="member-account-summary"><div><span>Membership</span><strong>{membership?.type_name || 'Library member'}</strong></div><div><span>Home branch</span><strong>{membership?.branch_name || 'Campus library'}</strong></div><div><span>Valid through</span><strong>{membership?.expires_at ? dateFormat.format(new Date(membership.expires_at)) : 'Not set'}</strong></div><div><span>Outstanding balance</span><strong>{moneyFormat.format(Number(dashboard?.outstandingFines) || 0)}</strong></div></section>
    <section className="account-columns">
      <div className="panel account-profile-panel"><div className="panel-heading"><div><span className="eyebrow">PERSONAL DETAILS</span><h2>Profile</h2></div></div><form className="record-form" onSubmit={saveProfile}><label>Full name<input name="fullName" defaultValue={profile.full_name} required minLength="2" /></label><label>University email<input value={profile.email} readOnly aria-describedby="email-readonly-note" /></label><span id="email-readonly-note" className="form-note">Email changes are handled by your library administrator.</span><div className="form-two-col"><label>Phone<input name="phone" defaultValue={profile.phone || ''} type="tel" /></label><label>Student ID<input value={profile.student_id || ''} readOnly /></label></div><div className="form-two-col"><label>Department<input name="department" defaultValue={profile.department || ''} /></label><label>Course or program<input name="program" defaultValue={profile.program || ''} /></label></div><label>Academic year<input name="academicYear" defaultValue={profile.academic_year || ''} /></label><label>Address<input name="address" defaultValue={profile.address || ''} /></label><button className="primary-button" disabled={busy}><Save size={15} />Save profile</button></form></div>
      <div className="panel account-password-panel"><div className="panel-heading"><div><span className="eyebrow">ACCOUNT SECURITY</span><h2>Change password</h2></div><KeyRound size={17} /></div><form className="record-form" onSubmit={changePassword}><label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength="10" required /></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength="10" required /></label>{passwordMessage && <p className="form-note" role="status">{passwordMessage}</p>}<button className="secondary-button" disabled={busy}>Update password</button></form></div>
    </section>
    <section className="panel account-loans-panel"><div className="panel-heading"><div><span className="eyebrow">BORROWING HISTORY</span><h2>Loans</h2></div><span className="account-section-count">{loans.length} records</span></div><div className="account-record-list">{loans.map((loan) => <article className="account-loan" key={loan.id}><span className="book-cover-mini"><BookOpen size={19} /></span><span className="account-loan-title"><strong>{loan.title}</strong><small>{loan.loan_code} · Issued {dateFormat.format(new Date(loan.issued_at))}</small></span><span className="account-due"><small>{loan.status === 'returned' ? 'Returned' : 'Due date'}</small><strong className={loan.status === 'overdue' ? 'overdue-text' : ''}>{dateFormat.format(new Date(loan.returned_at || loan.due_at))}</strong></span>{['active', 'overdue'].includes(loan.status) && <button className="text-action" onClick={() => renew(loan)}>Renew <ArrowRight size={13} /></button>}</article>)}{!loans.length && <div className="panel-empty">Your borrowing history will appear here.</div>}</div></section>
    <section className="account-secondary-grid">
      <div className="panel"><div className="panel-heading"><div><span className="eyebrow">WAITLIST</span><h2>Reservations</h2></div><span className="account-section-count">{reservations.length}</span></div><div className="account-record-list">{reservations.slice(0, 8).map((item) => <div className="account-reservation" key={item.id}><span className="compact-icon teal-icon"><Clock3 size={15} /></span><span><strong>{item.title}</strong><small>{item.status} · {item.reservation_code}</small></span>{['queued', 'ready'].includes(item.status) && <button className="text-action" onClick={() => cancelReservation(item)}>Cancel</button>}</div>)}{!reservations.length && <div className="panel-empty">No reservation history.</div>}</div></div>
      <div className="panel"><div className="panel-heading"><div><span className="eyebrow">FOR LATER</span><h2>Reading list</h2></div><span className="account-section-count">{saved.length}</span></div><div className="account-record-list">{saved.map((book) => <div className="account-reservation" key={book.id}><span className="compact-icon teal-icon"><Bookmark size={15} /></span><span><strong>{book.title}</strong><small>{book.publication_year || 'Publication year not listed'}</small></span><button className="text-action" onClick={() => toggleSaved(book)}>Remove</button></div>)}{!saved.length && <div className="panel-empty">Saved titles will appear here.</div>}</div></div>
    </section>
  </div>
}