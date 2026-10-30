import { useEffect, useState } from 'react'
import { AuthContext } from './auth-context.js'
import { api } from '../services/api.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let active = true
    async function restoreSession() {
      try {
        await api.get('/auth/csrf')
        const { data } = await api.get('/auth/me')
        if (active) setUser(data.data)
      } catch {
        if (active) setUser(null)
      } finally {
        if (active) setStatus('ready')
      }
    }
    restoreSession()
    return () => { active = false }
  }, [])

  async function login(credentials) {
    const { data } = await api.post('/auth/login', credentials)
    setUser(data.data)
    return data.data
  }

  async function logout() {
    try { await api.post('/auth/logout') } finally { setUser(null) }
  }

  return <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>
}