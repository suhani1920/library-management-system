import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1',
  withCredentials: true,
})

let refreshRequest

api.interceptors.request.use((config) => {
  const value = document.cookie.split('; ').find((part) => part.startsWith('csrf_token='))?.split('=').slice(1).join('=')
  if (value && !['get', 'head', 'options'].includes(config.method?.toLowerCase())) {
    config.headers['x-csrf-token'] = decodeURIComponent(value)
  }
  return config
})

api.interceptors.response.use((response) => response, async (error) => {
  const request = error.config
  const authRoute = ['/auth/login', '/auth/refresh', '/auth/logout'].some((route) => request?.url?.includes(route))
  if (error.response?.status !== 401 || !request || request._retry || authRoute) throw error

  request._retry = true
  try {
    refreshRequest ||= api.post('/auth/refresh').finally(() => { refreshRequest = null })
    await refreshRequest
    return api(request)
  } catch {
    throw error
  }
})

export { api }