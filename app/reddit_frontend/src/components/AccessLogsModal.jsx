import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Search, X, RefreshCw, Shield, LayoutGrid } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { API } from '../lib/utils'

function AccessLogsModal({ onClose }) {
  const { user } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/access-logs`, {
        headers: { 'x-user-id': user?.id }
      })
      if (res.ok) {
        setLogs(await res.json())
      } else {
        toast.error('Failed to load access logs')
      }
    } catch {
      toast.error('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const filteredLogs = logs.filter(log => {
    const ipMatch = log.ip.toLowerCase().includes(searchQuery.toLowerCase())
    const userMatch = log.user?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (!log.user && 'guest'.includes(searchQuery.toLowerCase()))
    const uaMatch = log.userAgent?.toLowerCase().includes(searchQuery.toLowerCase())
    return ipMatch || userMatch || uaMatch
  })

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 101 }}>
      <motion.div
        className="modal modal-wide access-logs-modal"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '850px', width: '90%' }}
      >
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={18} style={{ color: 'var(--primary)' }} />
            IP Access Logs
          </h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ padding: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-wrap" style={{ flex: 1, minWidth: '240px', margin: 0, position: 'relative' }}>
              <Search size={14} className="s-icon" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by IP, User, Browser..."
                style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
              />
              {searchQuery && (
                <button className="s-clear" onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <button className="btn-outline" onClick={fetchLogs} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface-hover)', cursor: 'pointer', color: 'var(--text)', fontSize: '13px', fontWeight: '500' }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="skeleton-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[1, 2, 3, 4].map(n => <div key={n} className="skeleton" style={{ height: '48px', borderRadius: '8px', background: 'var(--surface-hover)', animation: 'pulse 1.5s infinite' }} />)}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="empty-feed" style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-3)' }}>
              <LayoutGrid size={36} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ fontSize: '14px' }}>No access logs found matching search</p>
            </div>
          ) : (
            <div className="table-responsive" style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-2)' }}>IP Address</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-2)' }}>User</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-2)' }}>Accessed Time</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-2)' }}>User Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }} className="log-row">
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{log.ip}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {log.user ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="user-avatar" style={{
                              width: '22px', height: '22px', borderRadius: '50%', fontSize: '10px',
                              background: log.user.avatarUrl ? 'transparent' : (log.user.avatarColor ?? 'var(--primary)'),
                              color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, overflow: 'hidden'
                            }}>
                              {log.user.avatarUrl ? <img src={log.user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : log.user.username[0].toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 500 }}>u/{log.user.username}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Guest</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>
                        {new Date(log.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-3)', fontSize: '11px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.userAgent}>
                        {log.userAgent || 'Unknown'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default AccessLogsModal
