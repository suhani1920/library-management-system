import { useEffect, useState } from 'react'
import { Activity, AlertCircle, Bell, Building2, Check, Plus, RefreshCw, Shield, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const roleLabels = { super_admin: 'Super admin', librarian: 'Librarian', auditor: 'Auditor', member: 'Member' }
const explainError = (error, fallback) => error.response?.data?.error?.message || error.response?.data?.message || fallback

export function AdminPage() {
  const { user } = useAuth()
  const permissions = user.permissions || []
  const canSettings = permissions.includes('settings.manage')
  const canUsers = permissions.includes('users.manage')
  const canAudit = permissions.includes('audit.view')
  const canBranches = permissions.includes('branches.manage')
  const tabs = [canSettings && ['settings', 'Settings'], canUsers && ['users', 'User access'], canUsers && ['announcements', 'Announcements'], canBranches && ['branches', 'Branches'], canAudit && ['audit', 'Audit log']].filter(Boolean)
  const [tab, setTab] = useState(tabs[0]?.[0] || 'settings')
  const [response, setResponse] = useState({ key: null, data: {}, errors: {} })
  const [retry, setRetry] = useState(0)
  const [dialog, setDialog] = useState('')
  const [busy, setBusy] = useState(false)
  const key = `${tab}:${retry}`
  const loading = response.key !== key
  const data = response.key === key ? response.data : {}
  const errors = response.key === key ? response.errors : {}

  useEffect(() => {
    let active = true
    const requests = {}
    if (tab === 'settings' && canSettings) requests.settings = api.get('/admin/settings')
    if (tab === 'users' && canUsers) requests.users = api.get('/admin/users', { params: { page: 1, limit: 100 } })
    if (tab === 'announcements' && canUsers) requests.announcements = api.get('/admin/announcements')
    if (tab === 'branches' && canBranches) requests.branches = api.get('/admin/branches')
    if (tab === 'audit' && canAudit) requests.audit = api.get('/admin/audit-logs', { params: { page: 1, limit: 100 } })
    Promise.all(Object.entries(requests).map(async ([name, promise]) => {
      try { return [name, (await promise).data.data, ''] }
      catch (error) { return [name, null, explainError(error, 'Could not load this section.')] }
    })).then((results) => {
      if (!active) return
      const nextData = {}
      const nextErrors = {}
      for (const [name, value, error] of results) {
        if (error) nextErrors[name] = error
        else nextData[name] = value
      }
      setResponse({ key, data: nextData, errors: nextErrors })
    })
    return () => { active = false }
  }, [tab, retry, canSettings, canUsers, canBranches, canAudit, key])

  async function submitSettings(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const payload = {
      product_name: values.get('product_name'),
      currency: values.get('currency'),
      guest_catalogue: form.elements.guest_catalogue.checked,
      member_self_register: form.elements.member_self_register.checked,
      require_email_verification: form.elements.require_email_verification.checked,
      reviews_enabled: form.elements.reviews_enabled.checked,
      recommendations_enabled: form.elements.recommendations_enabled.checked,
      search_history_enabled: form.elements.search_history_enabled.checked,
      lost_book_default_charge: Number(values.get('lost_book_default_charge')),
      damage_default_charge: Number(values.get('damage_default_charge')),
    }
    await saveAction(() => api.patch('/admin/settings', payload), 'System settings saved')
  }

  async function createStaffUser(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const payload = Object.fromEntries(values.entries())
    payload.branchId = payload.branchId ? Number(payload.branchId) : null
    const saved = await saveAction(() => api.post('/admin/users', payload), 'Staff account created')
    if (saved) setDialog('')
  }

  async function createBranch(event) {
    event.preventDefault()
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries())
    const saved = await saveAction(() => api.post('/admin/branches', payload), 'Branch created')
    if (saved) setDialog('')
  }

  async function sendAnnouncement(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true)
    try {
      const { data } = await api.post('/admin/announcements', {
        title: values.get('title'),
        body: values.get('body'),
      })
      const result = data.data
      if (result.failed) toast.warning(`Processed ${result.processed} of ${result.recipients}; ${result.failed} delivery attempts failed.`)
      else toast.success(`Announcement processed for ${result.processed} of ${result.recipients} active members`)
      form.reset()
      setRetry((value) => value + 1)
    } catch (error) {
      toast.error(explainError(error, 'Announcement could not be sent.'))
    } finally {
      setBusy(false)
    }
  }

  async function saveAction(action, successMessage) {
    setBusy(true)
    try { await action(); toast.success(successMessage); setRetry((value) => value + 1); return true }
    catch (error) { toast.error(explainError(error, 'The operation could not be completed.')); return false }
    finally { setBusy(false) }
  }

  async function changeUserStatus(account) {
    const status = account.status === 'active' ? 'suspended' : 'active'
    await saveAction(() => api.post(`/admin/users/${account.id}/status`, { status }), `Account ${status === 'active' ? 'activated' : 'suspended'}`)
  }

  return <div className="page-enter"><PageHeading eyebrow="SYSTEM CONTROL" title="Administration" description="Manage access, library configuration, branches, and reviewable staff activity."><button className="icon-button" aria-label="Refresh administration data" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} /></button></PageHeading>
    <div className="admin-tabs" role="tablist" aria-label="Administration sections">{tabs.map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'admin-tab-active' : ''} onClick={() => setTab(value)}>{value === 'settings' ? <Shield size={15} /> : value === 'users' ? <Users size={15} /> : value === 'announcements' ? <Bell size={15} /> : value === 'branches' ? <Building2 size={15} /> : <Activity size={15} />}{label}</button>)}</div>
    {loading ? <div className="loading-state"><span className="loading-spinner" />Loading administration data</div> : <>
      {errors[tab] && <div className="banner-error"><AlertCircle size={16} />{errors[tab]}<button onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
      {tab === 'settings' && data.settings && <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">GLOBAL CONFIGURATION</span><h2>Library settings</h2></div></div><form className="record-form settings-form" onSubmit={submitSettings}><div className="form-two-col"><label>Product name<input name="product_name" defaultValue={data.settings.product_name || 'LibraCore'} required /></label><label>Currency code<input name="currency" defaultValue={data.settings.currency || 'INR'} maxLength="3" required /></label></div><div className="form-two-col"><label>Lost book default charge (INR)<input name="lost_book_default_charge" type="number" min="0" step="0.01" defaultValue={data.settings.lost_book_default_charge ?? 1500} /></label><label>Damage default charge (INR)<input name="damage_default_charge" type="number" min="0" step="0.01" defaultValue={data.settings.damage_default_charge ?? 400} /></label></div><div className="setting-toggles"><SettingToggle name="guest_catalogue" label="Guest catalogue browsing" detail="Allow unauthenticated visitors to search active titles." checked={data.settings.guest_catalogue} /><SettingToggle name="member_self_register" label="Member self-registration" detail="Allow eligible students to create an account." checked={data.settings.member_self_register} /><SettingToggle name="require_email_verification" label="Require email verification" detail="Hold new registrations pending email verification." checked={data.settings.require_email_verification} /><SettingToggle name="reviews_enabled" label="Book reviews" detail="Allow members to submit catalogue ratings and reviews." checked={data.settings.reviews_enabled} /><SettingToggle name="recommendations_enabled" label="Recommendations" detail="Show category-based suggestions on the member overview." checked={data.settings.recommendations_enabled} /><SettingToggle name="search_history_enabled" label="Search history analytics" detail="Record search terms for aggregate collection insights." checked={data.settings.search_history_enabled} /></div><button className="primary-button settings-save" disabled={busy}><Check size={15} />Save settings</button></form></section>}
      {tab === 'users' && data.users && <section className="panel admin-table-panel"><div className="panel-heading"><div><span className="eyebrow">STAFF ACCESS</span><h2>Accounts</h2></div><button className="primary-button" onClick={() => setDialog('user')}><UserPlus size={15} />Create account</button></div><div className="activity-table-wrap"><table className="data-table"><thead><tr><th>Account</th><th>Role</th><th>Branch</th><th>Last sign-in</th><th>Status</th><th>Action</th></tr></thead><tbody>{(data.users.items || []).map((account) => <tr key={account.id}><td><strong className="table-primary">{account.full_name}</strong><span className="table-secondary">{account.email}</span></td><td>{roleLabels[account.role_code] || account.role_code}</td><td>{account.branch_name || 'Global'}</td><td>{account.last_login_at ? dateFormat.format(new Date(account.last_login_at)) : 'Never'}</td><td><span className={`status-pill status-${account.status}`}>{account.status}</span></td><td>{account.id !== user.id && <button className="text-action" onClick={() => changeUserStatus(account)}>{account.status === 'active' ? 'Suspend' : 'Activate'}</button>}</td></tr>)}</tbody></table>{!data.users.items?.length && <div className="directory-empty"><Users size={20} /><strong>No accounts found</strong></div>}</div></section>}
      {tab === 'announcements' && data.announcements && <section className="admin-announcement-layout"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">MEMBER COMMUNICATION</span><h2>Send an announcement</h2></div><Bell size={17} /></div><form className="record-form" onSubmit={sendAnnouncement}><div className="announcement-scope"><strong>Recipients</strong><span>Active student/member accounts</span><small>Notifications respect each member's in-app and email preferences. Email delivery requires configured SMTP.</small></div><label>Subject<input name="title" minLength="3" maxLength="180" required placeholder="Example: Upcoming return deadline" /></label><label>Message<textarea name="body" minLength="5" maxLength="2000" rows="5" required placeholder="Include the date and any action students should take." /></label><div className="announcement-form-footer"><span>Creates an in-app notification and audit record.</span><button className="primary-button" disabled={busy}><Bell size={15} />{busy ? 'Sending…' : 'Send announcement'}</button></div></form></section><section className="panel admin-table-panel"><div className="panel-heading"><div><span className="eyebrow">BROADCAST HISTORY</span><h2>Recent announcements</h2></div><button className="icon-button" aria-label="Refresh announcement history" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={15} /></button></div><div className="announcement-history">{data.announcements.map((announcement) => <article className="announcement-entry" key={announcement.id}><div className="announcement-entry-top"><strong>{announcement.title}</strong><time>{dateFormat.format(new Date(announcement.created_at))}</time></div><p>{announcement.body}</p><small>{announcement.recipients} recipients · {announcement.unread} unread</small></article>)}{!data.announcements.length && <div className="directory-empty"><Bell size={18} /><strong>No announcements yet</strong></div>}</div></section></section>}
      {tab === 'branches' && data.branches && <section className="panel branch-table-panel"><div className="panel-heading"><div><span className="eyebrow">CAMPUS LOCATIONS</span><h2>Branches</h2></div><button className="primary-button" onClick={() => setDialog('branch')}><Plus size={15} />Add branch</button></div><div className="branch-grid">{data.branches.map((branch) => <article className="branch-row" key={branch.id}><span className="branch-icon"><Building2 size={18} /></span><span className="branch-details"><strong>{branch.name}</strong><small>{branch.code} · {branch.address || 'Address not listed'}</small><small>{branch.phone || 'No phone'} · {branch.email || 'No email'}</small></span><span className={`status-pill ${branch.is_active ? 'status-active' : 'status-inactive'}`}>{branch.is_active ? 'Active' : 'Inactive'}</span></article>)}</div></section>}
      {tab === 'audit' && data.audit && <section className="panel admin-table-panel"><div className="panel-heading"><div><span className="eyebrow">ACCOUNTABILITY</span><h2>Audit activity</h2></div><span className="report-row-count">{data.audit.pagination?.total || 0} records</span></div><div className="activity-table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>{(data.audit.items || []).map((entry) => <tr key={entry.id}><td>{dateFormat.format(new Date(entry.created_at))}</td><td>{entry.full_name || 'System'}</td><td className="mono-cell">{entry.action}</td><td>{entry.entity_type} · {entry.entity_id || '—'}</td><td className="audit-details">{entry.details ? JSON.stringify(entry.details) : '—'}</td></tr>)}</tbody></table>{!data.audit.items?.length && <div className="directory-empty"><Activity size={20} /><strong>No audit events yet</strong></div>}</div></section>}
    </>}
    {dialog === 'user' && <Modal eyebrow="STAFF ACCESS" title="Create account" close={() => setDialog('')}><form className="record-form" onSubmit={createStaffUser}><label>Full name<input name="fullName" required minLength="2" /></label><label>Work email<input name="email" type="email" required /></label><div className="form-two-col"><label>Role<select name="roleCode" defaultValue="librarian"><option value="librarian">Librarian</option><option value="auditor">Auditor</option><option value="super_admin">Super admin</option></select></label><label>Branch ID<input name="branchId" type="number" min="1" /></label></div><label>Temporary password<input name="password" type="password" minLength="10" autoComplete="new-password" required /></label><label>Phone<input name="phone" type="tel" /></label><p className="form-note">The user is required to change this password after their first sign-in.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog('')}>Cancel</button><button className="primary-button" disabled={busy}>Create account</button></div></form></Modal>}
    {dialog === 'branch' && <Modal eyebrow="CAMPUS LOCATIONS" title="Add a branch" close={() => setDialog('')}><form className="record-form" onSubmit={createBranch}><div className="form-two-col"><label>Branch code<input name="code" maxLength="20" required /></label><label>Branch name<input name="name" maxLength="150" required /></label></div><label>Address<input name="address" /></label><div className="form-two-col"><label>Phone<input name="phone" type="tel" /></label><label>Library email<input name="email" type="email" /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog('')}>Cancel</button><button className="primary-button" disabled={busy}>Create branch</button></div></form></Modal>}
  </div>
}

function SettingToggle({ name, label, detail, checked }) { return <label className="setting-toggle"><span><strong>{label}</strong><small>{detail}</small></span><input name={name} type="checkbox" defaultChecked={Boolean(checked)} /><i /></label> }
function PageHeading({ eyebrow, title, description, children }) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children && <div className="heading-actions">{children}</div>}</div> }
function Modal({ eyebrow, title, close, children }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title"><div className="modal-header"><div><span className="eyebrow">{eyebrow}</span><h2 id="admin-modal-title">{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div> }