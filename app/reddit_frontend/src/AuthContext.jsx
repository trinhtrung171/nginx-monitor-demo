import React, { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ds_user')) } catch { return null }
  })

  const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

  const login = async (identifier, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Login failed')
    localStorage.setItem('ds_user', JSON.stringify(data.user))
    setUser(data.user)
    // Log the new session so Access Logs DB shows guest → username transition
    fetch(`${API}/access-logs`, { method: 'POST', headers: { 'x-user-id': data.user.id } }).catch(() => {})
    return data.user
  }

  const register = async (username, email, password) => {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Registration failed')
    localStorage.setItem('ds_user', JSON.stringify(data.user))
    setUser(data.user)
    // Log the new session so Access Logs DB shows guest → username transition
    fetch(`${API}/access-logs`, { method: 'POST', headers: { 'x-user-id': data.user.id } }).catch(() => {})
    return data.user
  }

  const logout = () => {
    const oldUserId = user?.id
    // Log last activity as the old user BEFORE clearing
    if (oldUserId) {
      fetch(`${API}/access-logs`, { method: 'POST', headers: { 'x-user-id': oldUserId } }).catch(() => {})
    }
    localStorage.removeItem('ds_user')
    setUser(null)
    // Defer so React processes setUser → useEffect updates fetchMeta → wrapper picks up null userId
    // Explicitly read client IP from localStorage (saved by initClientIp) to ensure x-client-ip is always
    // present — the fetch wrapper may not have resolved clientIp yet, causing isRealUserRequest() to skip the log
    setTimeout(() => {
      const clientIp = localStorage.getItem('client_ip') || ''
      if (clientIp) {
        fetch(`${API}/access-logs`, { method: 'POST', headers: { 'x-client-ip': clientIp, 'x-user-id': '' } }).catch(() => {})
      } else {
        fetch(`${API}/access-logs`, { method: 'POST' }).catch(() => {})
      }
    }, 100)
  }

  const updateUser = (newData) => {
    const next = { ...user, ...newData }
    localStorage.setItem('ds_user', JSON.stringify(next))
    setUser(next)
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
