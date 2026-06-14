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
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('ds_user')
    setUser(null)
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
