import { useState } from 'react'
import { ArrowLeft, ArrowRight, LibraryBig, MailCheck, ShieldCheck } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../services/api.js'

const explainError = (error, fallback) => error.response?.data?.error?.message || error.response?.data?.message || fallback
const appYear = new Date().getFullYear()

export function RegisterPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const password = String(values.get('password'))
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{10,}$/.test(password)) {
      setError('Use at least 10 characters with uppercase, lowercase, a number, and a symbol.')
      return
    }
    setBusy(true); setError('')
    const payload = Object.fromEntries(values.entries())
    try {
      const { data } = await api.post('/auth/register', payload)
      setSuccess(data.data.status === 'pending' ? 'Registration received. Your account is pending approval or email verification.' : 'Your account is ready. Sign in with your new credentials.')
      form.reset()
    } catch (requestError) { setError(explainError(requestError, 'Registration could not be completed.')) }
    finally { setBusy(false) }
  }

  return <AuthPageFrame eyebrow="CAMPUS MEMBERSHIP" title="Create your library account" intro="Register with your university details to access borrowing and member services.">
    {success ? <div className="auth-success"><MailCheck size={25} /><strong>Request submitted</strong><p>{success}</p><button className="primary-button" onClick={() => navigate('/login')}>Continue to sign in <ArrowRight size={15} /></button></div> : <form className="login-form auth-extra-form" onSubmit={submit}><label>Full name<input name="fullName" autoComplete="name" minLength="2" maxLength="150" required /></label><label>University email<input name="email" type="email" autoComplete="email" required /></label><div className="form-two-col"><label>Student ID<input name="studentId" minLength="2" required /></label><label>Phone<input name="phone" type="tel" autoComplete="tel" /></label></div><div className="form-two-col"><label>Department<input name="department" /></label><label>Program<input name="program" /></label></div><label>Academic year<input name="academicYear" /></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength="10" required /></label>{error && <div className="inline-error" role="alert">{error}</div>}<button className="primary-button login-submit" disabled={busy}>{busy ? 'Submitting…' : 'Create account'}<ArrowRight size={16} /></button><p className="auth-password-note"><ShieldCheck size={14} />Use 10+ characters with upper/lowercase, number, and symbol.</p></form>}
    <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
  </AuthPageFrame>
}

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email'))
    setBusy(true); setError('')
    try { await api.post('/auth/forgot-password', { email }); setSubmitted(true) }
    catch (requestError) { setError(explainError(requestError, 'The request could not be submitted. Please try again.')) }
    finally { setBusy(false) }
  }

  return <AuthPageFrame eyebrow="ACCOUNT RECOVERY" title="Reset your password" intro="Enter your university email. If it is linked to an account, recovery instructions will be sent.">
    {submitted ? <div className="auth-success"><MailCheck size={25} /><strong>Check your inbox</strong><p>If the address matches an account, password reset instructions have been sent.</p></div> : <form className="login-form auth-extra-form" onSubmit={submit}><label>University email<input name="email" type="email" autoComplete="email" required /></label>{error && <div className="inline-error" role="alert">{error}</div>}<button className="primary-button login-submit" disabled={busy}>{busy ? 'Sending…' : 'Send recovery link'}<ArrowRight size={16} /></button></form>}
    <p className="auth-switch"><Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link></p>
  </AuthPageFrame>
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const newPassword = String(form.get('newPassword'))
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{10,}$/.test(newPassword)) {
      setError('Use at least 10 characters with uppercase, lowercase, a number, and a symbol.')
      return
    }
    if (newPassword !== form.get('confirmPassword')) { setError('The passwords do not match.'); return }
    setBusy(true); setError('')
    try { await api.post('/auth/reset-password', { token, newPassword }); setComplete(true) }
    catch (requestError) { setError(explainError(requestError, 'This reset link is invalid or expired.')) }
    finally { setBusy(false) }
  }

  return <AuthPageFrame eyebrow="ACCOUNT RECOVERY" title="Choose a new password" intro="Set a strong password for your campus library account.">
    {complete ? <div className="auth-success"><ShieldCheck size={25} /><strong>Password updated</strong><p>Your password has changed. Sign in again with your new credentials.</p><button className="primary-button" onClick={() => navigate('/login')}>Continue to sign in <ArrowRight size={15} /></button></div> : !token ? <div className="inline-error" role="alert">This reset link is missing its token. Request a new link.</div> : <form className="login-form auth-extra-form" onSubmit={submit}><label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength="10" required /></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength="10" required /></label>{error && <div className="inline-error" role="alert">{error}</div>}<button className="primary-button login-submit" disabled={busy}>{busy ? 'Updating…' : 'Set new password'}<ArrowRight size={16} /></button></form>}
    <p className="auth-switch"><Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link></p>
  </AuthPageFrame>
}

function AuthPageFrame({ eyebrow, title, intro, children }) {
  return <main className="login-screen"><section className="login-brand"><div className="login-brand-top"><span className="brand-mark"><LibraryBig size={23} /></span><span>LibraCore</span></div><div className="login-brand-copy"><span className="eyebrow">CAMPUS LIBRARY PLATFORM</span><h1>Every book.<br />Within reach.</h1><p>One calm place to discover, borrow, and care for your university library.</p></div><div className="login-brand-foot"><ShieldCheck size={16} />Secure access for your campus community</div></section><section className="login-panel"><div className="login-form-wrap"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p className="muted-copy">{intro}</p>{children}</div><span className="login-version">LIBRARY SERVICES · {appYear}</span></section></main>
}