import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Layers, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'

export default function AuthPage({ onClose }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ identifier: '', username: '', email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.identifier, form.password)
        toast.success('Welcome back! 👋')
      } else {
        await register(form.username, form.email, form.password)
        toast.success('Account created! 🎉')
      }
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        className="auth-modal"
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.93, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="auth-left">
          <div className="auth-brand"><Layers size={32} color="white"/></div>
          <h2>DevShare</h2>
          <p>Join the community where developers share, vote, and grow together.</p>
        </div>

        <div className="auth-right">
          <div className="auth-tabs">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log In</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Sign Up</button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <>
                <div className="field">
                  <label>Username</label>
                  <input placeholder="devshare_user" value={form.username} onChange={e => set('username', e.target.value)} required minLength={3} maxLength={20}/>
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="email" placeholder="you@example.com" value={form.email} onChange={e => set('email', e.target.value)} required/>
                </div>
              </>
            )}
            {mode === 'login' && (
              <div className="field">
                <label>Username or Email</label>
                <input placeholder="Enter username or email" value={form.identifier} onChange={e => set('identifier', e.target.value)} required/>
              </div>
            )}
            <div className="field">
              <label>Password</label>
              <div className="pw-wrap">
                <input type={showPw ? 'text' : 'password'} placeholder="Min. 6 characters" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6}/>
                <button type="button" className="pw-toggle" onClick={() => setShowPw(s => !s)}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Please wait…' : (mode === 'login' ? 'Log In' : 'Create Account')}
              {!loading && <ArrowRight size={16}/>}
            </button>

            <div className="auth-separator"><span>or</span></div>

            <button type="button" className="google-btn" onClick={() => toast('Google Login needs OAuth credentials!', { icon: '🚧' })}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? "Don't have an account? " : "Already have one? "}
            <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
