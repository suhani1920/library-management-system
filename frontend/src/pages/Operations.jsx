import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, Check, Clock3, Eye, Plus, RefreshCw, Search, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../services/api.js'

const numberFormat = new Intl.NumberFormat('en-IN')
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const count = (value) => numberFormat.format(Number(value) || 0)
const explainError = (error, fallback) => error.response?.data?.error?.message || error.response?.data?.message || fallback

function PageHeading({ eyebrow, title, description, children }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children && <div className="heading-actions">{children}</div>}</div>
}

function Loading({ label }) { return <div className="loading-state" role="status"><span className="loading-spinner" />{label}</div> }

function InlineError({ message, retry }) {
  return <div className="banner-error"><AlertCircle size={16} />{message}{retry && <button onClick={retry}>Retry</button>}</div>
}

export function MembersPage() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [listState, setListState] = useState({ key: null, data: null, error: '' })
  const [lookups, setLookups] = useState({ branches: [], types: [] })
  const [lookupError, setLookupError] = useState('')
  const [dialog, setDialog] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editingMember, setEditingMember] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const requestKey = JSON.stringify([submittedQuery, page, refresh, statusFilter])
  const loading = listState.key !== requestKey
  const list = listState.key === requestKey ? listState.data : null
  const error = listState.key === requestKey ? listState.error : ''

  useEffect(() => {
    let active = true
    Promise.all([api.get('/admin/branches'), api.get('/membership-types')]).then(([branches, types]) => {
      if (active) setLookups({ branches: branches.data.data || [], types: types.data.data || [] })
    }).catch((requestError) => { if (active) setLookupError(explainError(requestError, 'Member setup options could not be loaded.')) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    api.get('/members', { params: { q: submittedQuery || undefined, status: statusFilter || undefined, page, limit: 12 } })
      .then(({ data }) => { if (active) setListState({ key: requestKey, data: data.data, error: '' }) })
      .catch((requestError) => { if (active) setListState({ key: requestKey, data: null, error: explainError(requestError, 'Member records could not be loaded.') }) })
    return () => { active = false }
  }, [requestKey, page, refresh, submittedQuery, statusFilter])

  function searchMembers(event) { event.preventDefault(); setPage(1); setSubmittedQuery(query.trim()) }

  async function viewMember(memberId) {
    setDetailLoading(true)
    try { const { data } = await api.get(`/members/${memberId}`); setSelected(data.data) }
    catch (requestError) { toast.error(explainError(requestError, 'Member details could not be loaded.')) }
    finally { setDetailLoading(false) }
  }

  async function toggleStatus(member) {
    const status = member.status === 'active' ? 'suspended' : 'active'
    try {
      await api.post(`/members/${member.id}/status`, { status })
      toast.success(`Member ${status === 'active' ? 'reactivated' : 'suspended'}`)
      setRefresh((value) => value + 1)
      if (selected?.id === member.id) viewMember(member.id)
    } catch (requestError) { toast.error(explainError(requestError, 'Member status could not be updated.')) }
  }

  async function deactivateMember(member) {
    if (!window.confirm(`Deactivate ${member.full_name}'s library account? Historical loans and fines will be retained.`)) return
    try {
      await api.post(`/members/${member.id}/status`, { status: 'inactive' })
      toast.success('Member account deactivated')
      setRefresh((value) => value + 1)
      if (selected?.id === member.id) setSelected(null)
    } catch (requestError) { toast.error(explainError(requestError, 'Member could not be deactivated. Active loans must be resolved first.')) }
  }

  async function saveMember(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form.entries())
    try {
      await api.patch(`/members/${editingMember.id}`, payload)
      toast.success('Member details updated')
      setEditingMember(null)
      setRefresh((value) => value + 1)
    } catch (requestError) { toast.error(explainError(requestError, 'Member details could not be saved.')) }
  }

  async function createMember(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const payload = Object.fromEntries(form.entries())
    payload.branchId = Number(payload.branchId)
    payload.membershipTypeId = Number(payload.membershipTypeId)
    setSaving(true)
    try {
      const { data } = await api.post('/members', payload)
      toast.success(`Member ${data.data.memberCode} registered`)
      setDialog(false)
      formElement.reset()
      setRefresh((value) => value + 1)
    } catch (requestError) { toast.error(explainError(requestError, 'Member could not be registered.')) }
    finally { setSaving(false) }
  }

  return <div className="page-enter">
    <PageHeading eyebrow="MEMBER SERVICES" title="Members" description="Search campus memberships, review account activity, and register new members.">
      <button className="primary-button" onClick={() => setDialog(true)} disabled={!lookups.branches.length || !lookups.types.length}><Plus size={16} />Register member</button>
    </PageHeading>
    {lookupError && <InlineError message={lookupError} />}
    <form className="directory-toolbar" role="search" onSubmit={searchMembers}><label className="directory-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, member ID, or student ID" aria-label="Search members" /></label><button className="secondary-button" type="submit">Search</button><label className="member-status-filter"><span>Status</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option></select></label><span className="directory-count">{loading ? 'Loading records…' : `${count(list?.pagination?.total)} members`}</span></form>
    {error && <InlineError message={error} retry={() => setRefresh((value) => value + 1)} />}
    {loading ? <Loading label="Loading member records" /> : <>
      <section className="panel directory-panel"><div className="activity-table-wrap"><table className="data-table directory-table"><thead><tr><th>Member</th><th>Member ID</th><th>Department</th><th>Membership</th><th>Active loans</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {(list?.items || []).map((member) => <tr key={member.id}><td><strong className="table-primary">{member.full_name}</strong><span className="table-secondary">{member.email}</span></td><td className="mono-cell">{member.member_code}</td><td>{member.department || '—'}</td><td><strong className="table-primary">{member.membership_type || '—'}</strong><span className="table-secondary">Until {member.expires_at ? dateFormat.format(new Date(member.expires_at)) : 'not set'}</span></td><td>{count(member.active_loans)}</td><td><span className={`status-pill status-${member.status}`}>{member.status}</span></td><td><div className="table-actions"><button className="icon-button" aria-label={`View ${member.full_name}`} title="View account" onClick={() => viewMember(member.id)}><Eye size={16} /></button><button className="text-action" onClick={() => toggleStatus(member)}>{member.status === 'active' ? 'Suspend' : 'Activate'}</button>{member.status !== 'inactive' && <button className="text-action destructive-action" onClick={() => deactivateMember(member)}>Deactivate</button>}</div></td></tr>)}
      </tbody></table>{!list?.items?.length && <div className="directory-empty"><UserRound size={20} /><strong>No members found</strong><span>Try a different search or register a new member.</span></div>}</div></section>
      {list?.pagination && <div className="pagination-bar"><span>Page {list.pagination.page} of {list.pagination.totalPages}</span><div><button className="icon-button pagination-button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ArrowLeft size={17} /></button><button className="icon-button pagination-button" aria-label="Next page" disabled={page >= list.pagination.totalPages} onClick={() => setPage((value) => value + 1)}><ArrowRight size={17} /></button></div></div>}
    </>}
    {dialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(false) }}><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="member-dialog-title"><div className="modal-header"><div><span className="eyebrow">NEW ACCOUNT</span><h2 id="member-dialog-title">Register a member</h2></div><button className="icon-button" onClick={() => setDialog(false)} aria-label="Close dialog"><X size={18} /></button></div>
      <form className="record-form" onSubmit={createMember}><label>Full name<input name="fullName" required minLength="2" maxLength="150" /></label><label>University email<input name="email" type="email" required /></label><div className="form-two-col"><label>Student / employee ID<input name="studentId" /></label><label>Phone<input name="phone" type="tel" /></label></div><div className="form-two-col"><label>Department<input name="department" /></label><label>Course or program<input name="program" /></label></div><div className="form-two-col"><label>Academic year<input name="academicYear" /></label><label>Initial password<input name="password" type="password" minLength="10" required autoComplete="new-password" /></label></div><div className="form-two-col"><label>Membership type<select name="membershipTypeId" required defaultValue=""><option value="" disabled>Select type</option>{lookups.types.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label><label>Home branch<select name="branchId" required defaultValue=""><option value="" disabled>Select branch</option>{lookups.branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label></div><p className="form-note">The initial password is stored as a hash. Share it through your institution’s approved channel.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Registering…' : 'Create account'}</button></div></form>
    </section></div>}
    {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><section className="modal-panel member-detail" role="dialog" aria-modal="true" aria-labelledby="member-detail-title"><div className="modal-header"><div><span className="eyebrow">MEMBER RECORD</span><h2 id="member-detail-title">{selected.full_name}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={18} /></button></div>
      {detailLoading ? <Loading label="Loading member activity" /> : <><div className="detail-summary"><span>{selected.member_code}</span><span>{selected.email}</span><span>{selected.department || 'Department not listed'}</span></div><div className="detail-actions"><span className={`status-pill status-${selected.status}`}>{selected.status}</span><button className="secondary-button" onClick={() => { setEditingMember(selected); setSelected(null) }}>Edit member</button>{selected.status !== 'inactive' && <button className="text-action destructive-action" onClick={() => deactivateMember(selected)}>Deactivate</button>}</div><h3 className="detail-section-title">Recent borrowing</h3><div className="detail-record-list">{(selected.loans || []).slice(0, 8).map((loan) => <div className="detail-record" key={loan.id}><BookOpen size={16} /><span><strong>{loan.title}</strong><small>{loan.loan_code} · Due {dateFormat.format(new Date(loan.due_at))}</small></span><span className={`status-pill status-${loan.status}`}>{loan.status}</span></div>)}{!selected.loans?.length && <p className="panel-empty">No loan history.</p>}</div><h3 className="detail-section-title">Membership</h3>{selected.memberships?.[0] && <div className="membership-detail"><strong>{selected.memberships[0].type_name}</strong><span>{selected.memberships[0].status} · expires {dateFormat.format(new Date(selected.memberships[0].expires_at))}</span></div>}</>}
    </section></div>}
    {editingMember && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingMember(null) }}><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="edit-member-title"><div className="modal-header"><div><span className="eyebrow">MEMBER RECORD</span><h2 id="edit-member-title">Edit {editingMember.full_name}</h2></div><button className="icon-button" onClick={() => setEditingMember(null)} aria-label="Close edit form"><X size={18} /></button></div><form className="record-form" onSubmit={saveMember}><label>Full name<input name="fullName" defaultValue={editingMember.full_name} required minLength="2" /></label><label>Phone<input name="phone" type="tel" defaultValue={editingMember.phone || ''} /></label><div className="form-two-col"><label>Department<input name="department" defaultValue={editingMember.department || ''} /></label><label>Program<input name="program" defaultValue={editingMember.program || ''} /></label></div><label>Academic year<input name="academicYear" defaultValue={editingMember.academic_year || ''} /></label><label>Address<input name="address" defaultValue={editingMember.address || ''} /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditingMember(null)}>Cancel</button><button type="submit" className="primary-button">Save changes</button></div></form></section></div>}
  </div>
}

export function CirculationPage() {
  const [mode, setMode] = useState('issue')
  const [memberKey, setMemberKey] = useState('')
  const [barcode, setBarcode] = useState('')
  const [issuePreview, setIssuePreview] = useState(null)
  const [returnPreview, setReturnPreview] = useState(null)
  const [returnCondition, setReturnCondition] = useState('good')
  const [damageCharge, setDamageCharge] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [loansState, setLoansState] = useState({ key: null, data: null, error: '' })
  const [refresh, setRefresh] = useState(0)
  const requestKey = String(refresh)
  const loading = loansState.key !== requestKey
  const loans = loansState.key === requestKey ? loansState.data : null
  const loanError = loansState.key === requestKey ? loansState.error : ''

  useEffect(() => {
    let active = true
    api.get('/loans', { params: { status: 'active', page: 1, limit: 20 } })
      .then(({ data }) => { if (active) setLoansState({ key: requestKey, data: data.data, error: '' }) })
      .catch((requestError) => { if (active) setLoansState({ key: requestKey, data: null, error: explainError(requestError, 'Active loans could not be loaded.') }) })
    return () => { active = false }
  }, [requestKey])

  function switchMode(nextMode) { setMode(nextMode); setIssuePreview(null); setReturnPreview(null); setPreviewError(''); setNotes(''); setDamageCharge('') }

  async function previewIssue(event) {
    event.preventDefault()
    setBusy(true); setPreviewError(''); setIssuePreview(null)
    try { const { data } = await api.post('/loans/preview-issue', { memberKey, barcode }); setIssuePreview(data.data) }
    catch (requestError) { setPreviewError(explainError(requestError, 'Issue eligibility could not be checked.')) }
    finally { setBusy(false) }
  }

  async function confirmIssue() {
    setBusy(true); setPreviewError('')
    try {
      const { data } = await api.post('/loans/issue', { memberKey, barcode, notes: notes || undefined })
      toast.success(`${data.data.title} issued to ${data.data.memberName}`)
      setMemberKey(''); setBarcode(''); setNotes(''); setIssuePreview(null); setRefresh((value) => value + 1)
    } catch (requestError) { setPreviewError(explainError(requestError, 'The copy could not be issued. Recheck availability and eligibility.')) }
    finally { setBusy(false) }
  }

  async function previewReturn(event) {
    event.preventDefault()
    setBusy(true); setPreviewError(''); setReturnPreview(null)
    try { const { data } = await api.get('/loans/preview-return', { params: { barcode } }); setReturnPreview(data.data) }
    catch (requestError) { setPreviewError(explainError(requestError, 'No active loan matched that barcode or loan ID.')) }
    finally { setBusy(false) }
  }

  async function confirmReturn() {
    setBusy(true); setPreviewError('')
    const payload = { condition: returnCondition, notes: notes || undefined }
    if (damageCharge !== '') payload.damageCharge = Number(damageCharge)
    try {
      const { data } = await api.post(`/loans/${returnPreview.id}/return`, payload)
      const amount = Number(data.data.fine?.amount || 0)
      toast.success(amount ? `Return recorded. Fine assessed: ₹${amount.toFixed(2)}` : 'Return recorded successfully')
      setBarcode(''); setNotes(''); setDamageCharge(''); setReturnPreview(null); setRefresh((value) => value + 1)
    } catch (requestError) { setPreviewError(explainError(requestError, 'The return could not be recorded.')) }
    finally { setBusy(false) }
  }

  async function renewLoan(loan) {
    try { await api.post(`/loans/${loan.id}/renew`); toast.success(`${loan.loan_code} renewed`); setRefresh((value) => value + 1) }
    catch (requestError) { toast.error(explainError(requestError, 'This loan cannot be renewed.')) }
  }

  return <div className="page-enter"><PageHeading eyebrow="CIRCULATION SERVICES" title="Circulation desk" description="Issue and return physical copies with server-checked policy validation." />
    <div className="circulation-tabs" role="tablist" aria-label="Circulation action"><button role="tab" aria-selected={mode === 'issue'} className={mode === 'issue' ? 'tab-active' : ''} onClick={() => switchMode('issue')}><ArrowDownRightIcon />Issue a copy</button><button role="tab" aria-selected={mode === 'return'} className={mode === 'return' ? 'tab-active' : ''} onClick={() => switchMode('return')}><ArrowLeft size={16} />Return a copy</button></div>
    <section className="circulation-layout"><div className="panel circulation-form-panel"><div className="panel-heading"><div><span className="eyebrow">{mode === 'issue' ? 'CHECKOUT' : 'CHECK-IN'}</span><h2>{mode === 'issue' ? 'Transaction details' : 'Find an active loan'}</h2></div></div>
      {mode === 'issue' ? <form className="record-form circulation-form" onSubmit={previewIssue}><label>Member code or student ID<input value={memberKey} onChange={(event) => { setMemberKey(event.target.value); setIssuePreview(null) }} autoComplete="off" required placeholder="Scan or enter member ID" /></label><label>Copy barcode<input value={barcode} onChange={(event) => { setBarcode(event.target.value); setIssuePreview(null) }} autoComplete="off" required placeholder="Scan or enter copy barcode" /></label><label>Transaction note <span className="optional-label">Optional</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="2" maxLength="500" /></label>{previewError && <InlineError message={previewError} />}<button type="submit" className="primary-button" disabled={busy}>{busy ? 'Checking eligibility…' : 'Check eligibility'}<ArrowRight size={16} /></button></form> : <form className="record-form circulation-form" onSubmit={previewReturn}><label>Copy barcode or loan ID<input value={barcode} onChange={(event) => { setBarcode(event.target.value); setReturnPreview(null) }} autoComplete="off" required placeholder="Scan or enter barcode / loan ID" /></label>{previewError && <InlineError message={previewError} />}<button type="submit" className="primary-button" disabled={busy}>{busy ? 'Looking up loan…' : 'Preview return'}<Search size={16} /></button></form>}
    </div>
    <div className="panel transaction-panel"><div className="panel-heading"><div><span className="eyebrow">POLICY CHECK</span><h2>{mode === 'issue' ? 'Eligibility preview' : 'Return assessment'}</h2></div></div>
      {mode === 'issue' && issuePreview ? <div className="preview-content"><div className={`eligibility-banner ${issuePreview.eligible ? 'eligible' : 'ineligible'}`}><span>{issuePreview.eligible ? <Check size={17} /> : <AlertCircle size={17} />}</span><div><strong>{issuePreview.eligible ? 'Eligible to borrow' : 'Issue cannot proceed'}</strong><small>{issuePreview.reasons?.length ? issuePreview.reasons.join(' · ') : `${issuePreview.policy.loanPeriodDays} day loan period · ${issuePreview.policy.renewalLimit} renewal allowed`}</small></div></div><dl className="preview-facts"><div><dt>Member</dt><dd>{issuePreview.member.name} · {issuePreview.member.code}</dd></div><div><dt>Title</dt><dd>{issuePreview.copy.title}</dd></div><div><dt>Barcode</dt><dd>{issuePreview.copy.barcode}</dd></div><div><dt>Due date</dt><dd>{dateFormat.format(new Date(issuePreview.dueAt))}</dd></div><div><dt>Active loans</dt><dd>{count(issuePreview.member.activeLoans)} of {count(issuePreview.member.borrowLimit)}</dd></div></dl><button className="primary-button full-width" onClick={confirmIssue} disabled={!issuePreview.eligible || busy}>{busy ? 'Completing issue…' : 'Confirm issue'}<Check size={16} /></button></div> : null}
      {mode === 'return' && returnPreview ? <div className="preview-content"><div className="return-title"><span className="book-cover-mini"><BookOpen size={19} /></span><div><strong>{returnPreview.title}</strong><small>{returnPreview.full_name} · {returnPreview.barcode}</small></div></div><div className="fine-preview"><span>Current overdue fine</span><strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(returnPreview.previewFine.amount) || 0)}</strong><small>{count(returnPreview.previewFine.lateDays)} overdue day(s), after grace period</small></div><label className="condition-field">Copy condition<select value={returnCondition} onChange={(event) => setReturnCondition(event.target.value)}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option><option value="lost">Lost</option></select></label>{returnCondition !== 'good' && <label className="condition-field">{returnCondition === 'lost' ? 'Lost-book charge' : 'Damage charge'} (INR)<input type="number" min="0" step="0.01" value={damageCharge} onChange={(event) => setDamageCharge(event.target.value)} /></label>}<label className="condition-field">Staff note<textarea rows="2" maxLength="500" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{previewError && <InlineError message={previewError} />}<button className="primary-button full-width" onClick={confirmReturn} disabled={busy}>{busy ? 'Recording return…' : 'Confirm return'}<Check size={16} /></button></div> : null}
      {mode === 'issue' && !issuePreview && <div className="policy-placeholder"><span className="empty-icon"><Clock3 size={19} /></span><strong>Validate before issuing</strong><p>Enter a member and scan a copy. Loan rules and availability are checked on the server.</p></div>}
      {mode === 'return' && !returnPreview && <div className="policy-placeholder"><span className="empty-icon"><Clock3 size={19} /></span><strong>Preview before check-in</strong><p>The active loan, due date, and current overdue charge are calculated from the loan record.</p></div>}
    </div></section>
    <section className="panel active-loans-panel"><div className="panel-heading"><div><span className="eyebrow">LIVE QUEUE</span><h2>Currently on loan</h2></div><button className="icon-button" aria-label="Refresh active loans" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} /></button></div>
      {loanError && <InlineError message={loanError} retry={() => setRefresh((value) => value + 1)} />}{loading ? <Loading label="Loading active loans" /> : <div className="activity-table-wrap"><table className="data-table"><thead><tr><th>Title</th><th>Member</th><th>Barcode</th><th>Due date</th><th>Status</th><th>Action</th></tr></thead><tbody>{(loans?.items || []).map((loan) => <tr key={loan.id}><td><strong className="table-primary">{loan.title}</strong><span className="table-secondary">{loan.loan_code}</span></td><td>{loan.full_name}</td><td className="mono-cell">{loan.barcode}</td><td>{dateFormat.format(new Date(loan.due_at))}</td><td><span className={`status-pill status-${loan.status}`}>{loan.status}</span></td><td>{loan.status === 'active' && <button className="text-action" onClick={() => renewLoan(loan)}>Renew</button>}</td></tr>)}</tbody></table>{!loans?.items?.length && <div className="directory-empty"><Check size={20} /><strong>No active loans</strong><span>Newly issued copies will appear in this list.</span></div>}</div>}
    </section>
  </div>
}

function ArrowDownRightIcon() { return <ArrowRight size={16} /> }