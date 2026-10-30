import { useEffect, useState } from 'react'
import { Archive, ArrowLeft, ArrowRight, BookOpen, CopyPlus, Eye, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

const count = (value) => new Intl.NumberFormat('en-IN').format(Number(value) || 0)
const explainError = (error, fallback) => error.response?.data?.error?.message || error.response?.data?.message || fallback

export function InventoryPage() {
  const { user } = useAuth()
  const canWrite = user.permissions?.includes('books.write')
  const canAddCopies = user.permissions?.includes('copies.write')
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [archived, setArchived] = useState(false)
  const [request, setRequest] = useState({ key: '', data: null, error: '' })
  const [lookups, setLookups] = useState({ authors: [], publishers: [], categories: [], shelves: [], branches: [] })
  const [lookupError, setLookupError] = useState('')
  const [dialog, setDialog] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([submittedQuery, page, archived, retry])
  const loading = request.key !== key
  const result = request.key === key ? request.data : null
  const error = request.key === key ? request.error : ''

  useEffect(() => {
    let active = true
    api.get('/books/lookups').then(({ data }) => { if (active) setLookups(data.data) })
      .catch((requestError) => { if (active) setLookupError(explainError(requestError, 'Inventory lookups could not be loaded.')) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    api.get('/books', { params: { q: submittedQuery || undefined, page, limit: 20, status: archived ? 'archived' : 'active' } })
      .then(({ data }) => { if (active) setRequest({ key, data: data.data, error: '' }) })
      .catch((requestError) => { if (active) setRequest({ key, data: null, error: explainError(requestError, 'Inventory could not be loaded.') }) })
    return () => { active = false }
  }, [key, submittedQuery, page, archived, retry])

  function searchBooks(event) { event.preventDefault(); setPage(1); setSubmittedQuery(query.trim()) }

  async function showDetails(book) {
    try { const { data } = await api.get(`/books/${book.id}`); setSelected(book); setDetail(data.data) }
    catch (requestError) { toast.error(explainError(requestError, 'Book details could not be loaded.')) }
  }

  async function createBook(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const authorIds = Array.from(form.elements.authorIds.selectedOptions, (option) => Number(option.value))
    const categoryIds = Array.from(form.elements.categoryIds.selectedOptions, (option) => Number(option.value))
    const payload = {
      title: values.get('title'),
      subtitle: values.get('subtitle') || undefined,
      description: values.get('description') || undefined,
      isbn10: values.get('isbn10') || undefined,
      isbn13: values.get('isbn13') || undefined,
      language: values.get('language') || 'English',
      edition: values.get('edition') || undefined,
      publicationYear: values.get('publicationYear') ? Number(values.get('publicationYear')) : undefined,
      publisherId: values.get('publisherId') ? Number(values.get('publisherId')) : undefined,
      classificationCode: values.get('classificationCode') || undefined,
      keywords: values.get('keywords') || undefined,
      authorIds,
      categoryIds,
    }
    setBusy(true)
    try {
      const { data } = await api.post('/books', payload)
      toast.success(`Title created: ${data.data.bookCode}`)
      setDialog(''); setRetry((value) => value + 1)
    } catch (requestError) { toast.error(explainError(requestError, 'Title could not be created.')) }
    finally { setBusy(false) }
  }

  async function addCopies(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const payload = {
      count: Number(values.get('count')),
      branchId: Number(values.get('branchId')),
      shelfId: values.get('shelfId') ? Number(values.get('shelfId')) : undefined,
      acquisitionSource: values.get('acquisitionSource') || undefined,
      purchaseCost: values.get('purchaseCost') ? Number(values.get('purchaseCost')) : undefined,
      condition: values.get('condition'),
    }
    setBusy(true)
    try {
      const { data } = await api.post(`/books/${selected.id}/copies`, payload)
      toast.success(`${data.data.length} physical cop${data.data.length === 1 ? 'y' : 'ies'} added`)
      setDialog(''); setRetry((value) => value + 1); showDetails(selected)
    } catch (requestError) { toast.error(explainError(requestError, 'Copies could not be added.')) }
    finally { setBusy(false) }
  }

  async function archiveBook(book) {
    if (!window.confirm(`Archive “${book.title}”? It will no longer appear in active catalogue searches.`)) return
    try {
      await api.post(`/books/${book.id}/archive`)
      toast.success('Title archived')
      setDetail(null); setSelected(null); setRetry((value) => value + 1)
    } catch (requestError) { toast.error(explainError(requestError, 'Title could not be archived.')) }
  }

  async function restoreBook(book) {
    try {
      await api.patch(`/books/${book.id}`, { status: 'active' })
      toast.success('Title restored to the active catalogue')
      setDetail(null); setSelected(null); setRetry((value) => value + 1)
    } catch (requestError) { toast.error(explainError(requestError, 'Title could not be restored.')) }
  }

  return <div className="page-enter"><div className="page-heading"><div><span className="eyebrow">COLLECTION MANAGEMENT</span><h1>Books & inventory</h1><p>Manage bibliographic titles and their individually barcoded physical copies.</p></div><div className="heading-actions">{canWrite && <button className="primary-button" onClick={() => setDialog('book')}><Plus size={15} />Add title</button>}</div></div>
    {lookupError && <div className="banner-error">{lookupError}</div>}
    <form className="directory-toolbar" role="search" onSubmit={searchBooks}><label className="directory-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, author, ISBN, or keyword" aria-label="Search inventory" /></label><button className="secondary-button">Search</button><label className="archive-filter"><input type="checkbox" checked={archived} onChange={(event) => { setArchived(event.target.checked); setPage(1); setRetry((value) => value + 1) }} />Include archived</label><span className="directory-count">{loading ? 'Loading titles…' : `${count(result?.pagination?.total)} titles`}</span></form>
    {error && <div className="banner-error">{error}<button onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {loading ? <div className="loading-state"><span className="loading-spinner" />Loading collection</div> : <section className="panel inventory-panel"><div className="activity-table-wrap"><table className="data-table inventory-table"><thead><tr><th>Title</th><th>Identifier</th><th>Authors</th><th>Copies</th><th>Availability</th><th>Category</th><th>Actions</th></tr></thead><tbody>{(result?.items || []).map((book) => <tr key={book.id}><td><strong className="table-primary">{book.title}</strong><span className="table-secondary">{book.edition || 'Edition not listed'} · {book.publication_year || 'Year not listed'}</span></td><td className="mono-cell">{book.isbn13 || book.isbn10 || book.book_code}</td><td>{book.authors || '—'}</td><td>{count(book.copy_count)}</td><td><span className="inventory-availability">{count(book.available_copies)} available</span></td><td>{book.categories || '—'}</td><td><div className="table-actions"><button className="icon-button" aria-label={`View ${book.title}`} onClick={() => showDetails(book)}><Eye size={16} /></button>{canAddCopies && !archived && <button className="icon-button" aria-label={`Add copies for ${book.title}`} onClick={() => { setSelected(book); setDialog('copies') }}><CopyPlus size={16} /></button>}{canWrite && !archived && <button className="icon-button archive-action" aria-label={`Archive ${book.title}`} onClick={() => archiveBook(book)}><Archive size={15} /></button>}</div></td></tr>)}</tbody></table>{!result?.items?.length && <div className="directory-empty"><BookOpen size={20} /><strong>No titles found</strong><span>Try a different search or add a new title.</span></div>}</div></section>}
    {result?.pagination && <div className="pagination-bar"><span>Page {result.pagination.page} of {result.pagination.totalPages}</span><div><button className="icon-button pagination-button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ArrowLeft size={17} /></button><button className="icon-button pagination-button" aria-label="Next page" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)}><ArrowRight size={17} /></button></div></div>}
    {dialog === 'book' && <Modal title="Add a catalogue title" eyebrow="NEW BIBLIOGRAPHIC RECORD" close={() => setDialog('')}><form className="record-form" onSubmit={createBook}><label>Title<input name="title" maxLength="255" required /></label><label>Subtitle<input name="subtitle" /></label><div className="form-two-col"><label>ISBN-13<input name="isbn13" minLength="13" maxLength="13" /></label><label>ISBN-10<input name="isbn10" minLength="10" maxLength="10" /></label></div><div className="form-two-col"><label>Edition<input name="edition" /></label><label>Publication year<input name="publicationYear" type="number" min="1400" max="2100" /></label></div><div className="form-two-col"><label>Language<input name="language" defaultValue="English" /></label><label>Publisher<select name="publisherId" defaultValue=""><option value="">Not specified</option>{lookups.publishers.map((publisher) => <option value={publisher.id} key={publisher.id}>{publisher.name}</option>)}</select></label></div><div className="form-two-col"><label>Authors<select name="authorIds" multiple size="4">{lookups.authors.map((author) => <option value={author.id} key={author.id}>{author.full_name}</option>)}</select></label><label>Categories<select name="categoryIds" multiple size="4">{lookups.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div><label>Classification code<input name="classificationCode" /></label><label>Keywords<input name="keywords" /></label><label>Description<textarea name="description" rows="3" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog('')}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create title'}</button></div></form></Modal>}
    {dialog === 'copies' && selected && <Modal title={`Add copies: ${selected.title}`} eyebrow="PHYSICAL INVENTORY" close={() => setDialog('')}><form className="record-form" onSubmit={addCopies}><label>Number of copies<input name="count" type="number" min="1" max="50" defaultValue="1" required /></label><div className="form-two-col"><label>Branch<select name="branchId" required defaultValue=""><option value="" disabled>Select branch</option>{lookups.branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label><label>Shelf<select name="shelfId" defaultValue=""><option value="">Unassigned</option>{lookups.shelves.map((shelf) => <option value={shelf.id} key={shelf.id}>{shelf.code} · {shelf.name}</option>)}</select></label></div><div className="form-two-col"><label>Condition<select name="condition" defaultValue="good"><option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option></select></label><label>Acquisition cost (INR)<input name="purchaseCost" type="number" min="0" step="0.01" /></label></div><label>Acquisition source<input name="acquisitionSource" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog('')}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Adding…' : 'Add copies'}</button></div></form></Modal>}
    {detail && <Modal title={detail.title} eyebrow={detail.book_code} close={() => { setDetail(null); setSelected(null) }}><div className="detail-summary"><span>{detail.isbn13 || detail.isbn10 || 'ISBN not listed'}</span><span>{detail.publisher_name || 'Publisher not listed'}</span><span>{detail.publication_year || 'Year not listed'}</span><span>{detail.copy_count} copies · {detail.available_copies} available</span></div><h3 className="detail-section-title">Physical copies</h3><div className="detail-record-list">{(detail.copies || []).map((copy) => <div className="detail-record" key={copy.id}><BookOpen size={15} /><span><strong>{copy.barcode}</strong><small>{copy.branch_name} · Shelf {copy.shelf_code || 'unassigned'} · {copy.condition_code}</small></span><span className={`status-pill status-${copy.availability_status}`}>{copy.availability_status}</span></div>)}{!detail.copies?.length && <p className="panel-empty">No physical copies registered.</p>}</div><div className="detail-actions"><span>Rating {detail.avg_rating ? Number(detail.avg_rating).toFixed(1) : '—'} / 5 · {count(detail.review_count)} reviews</span>{canAddCopies && detail.status === 'active' && <button className="secondary-button" onClick={() => { setDetail(null); setDialog('copies') }}><CopyPlus size={15} />Add copies</button>}{canWrite && detail.status === 'archived' && <button className="secondary-button" onClick={() => restoreBook(detail)}>Restore title</button>}</div></Modal>}
  </div>
}

function Modal({ eyebrow, title, close, children }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section className="modal-panel inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-dialog-title"><div className="modal-header"><div><span className="eyebrow">{eyebrow}</span><h2 id="inventory-dialog-title">{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div> }