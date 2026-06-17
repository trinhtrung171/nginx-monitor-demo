import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast, { Toaster } from 'react-hot-toast'
import { Search, Plus, Home, TrendingUp, LayoutGrid, Moon, Sun, Bell, X, RefreshCw, Clock, Flame, Award, Layers, ChevronDown, LogIn, PanelLeftClose, PanelLeftOpen, Edit3, Settings as SettingsIcon, Shield, Users, Crown } from 'lucide-react'
import { useAuth } from './AuthContext'
import AuthPage from './AuthPage'
import ProfilePage from './ProfilePage'
import CreatePostModal from './CreatePostModal'
import PostCard from './components/PostCard'
import PostDetail from './components/PostDetail'
import AccessLogsModal from './components/AccessLogsModal'
import { initClientIp } from './clientIp'
import { API, timeAgo, getScore } from './lib/utils'
import './App.css'
export default function App() {
  const { user, logout, updateUser } = useAuth()
  const [posts, setPosts] = useState([])
  const [subreddits, setSubreddits] = useState([])
  const [loading, setLoading] = useState(true)
  const [isDark, setIsDark] = useState(false)
  const [selectedSub, setSelectedSub] = useState(null)
  const [selectedPost, setSelectedPost] = useState(null)
  const [profileUser, setProfileUser] = useState(null)
  const [joinedSubs, setJoinedSubs] = useState(new Set())
  useEffect(() => {
    if (user?.subscriptions) {
      setJoinedSubs(new Set(user.subscriptions.map(s => subreddits.find(sub => sub.id === s.subredditId)?.name).filter(Boolean)))
    } else {
      setJoinedSubs(new Set())
    }
  }, [user, subreddits])
  const [showAuth, setShowAuth] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [showCreateSub, setShowCreateSub] = useState(false)
  const [sortBy, setSortBy] = useState('new')
  const [searchQuery, setSearchQuery] = useState('')
  const [newSub, setNewSub] = useState({ name: '', description: '' })
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [actionModal, setActionModal] = useState(null) // { type: 'REPORT'|'DELETE'|'NOTE', post }
  const [actionText, setActionText] = useState('')
  const [actionTitle, setActionTitle] = useState('')
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [showSubSettings, setShowSubSettings] = useState(false)
  const [subSettingsTab, setSubSettingsTab] = useState('info')
  const [members, setMembers] = useState([])
  const [subDesc, setSubDesc] = useState('')
  const [showAccessLogs, setShowAccessLogs] = useState(false)
  const modAddRef = useRef(null)

  // Ref-based fetch wrapper — always reads latest userId + clientIp without re-wrapping
  const fetchMeta = useRef({ userId: null, clientIp: '' });

  useEffect(() => {
    fetchMeta.current.userId = user?.id || null;
  }, [user?.id]);

  useEffect(() => {
    initClientIp().then(ip => { fetchMeta.current.clientIp = ip; });
  }, []);

  useEffect(() => {
    const origFetch = window.fetch.bind(window);
    window.fetch = function(input, init = {}) {
      const { userId, clientIp } = fetchMeta.current;
      const extraHeaders = {};
      if (userId) extraHeaders['x-user-id'] = userId;
      if (clientIp) extraHeaders['x-client-ip'] = clientIp;
      init.headers = { ...init.headers, ...extraHeaders };
      return origFetch(input, init);
    };
  }, []);

  // Log access on app mount (first load / reloads / new session)
  useEffect(() => {
    const logAccess = async () => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        try {
          const storedUser = localStorage.getItem('ds_user');
          if (storedUser) {
            const parsed = JSON.parse(storedUser);
            if (parsed?.id) {
              headers['x-user-id'] = parsed.id;
            }
          }
        } catch {}
        await fetch(`${API}/access-logs`, {
          method: 'POST',
          headers
        });
      } catch (err) {
        console.error('Failed to log access:', err);
      }
    };
    logAccess();
  }, []);

  const fetchNotifs = async () => {
    if (!user) { setNotifications([]); return; }
    try {
      const res = await fetch(`${API}/notifications`, { headers: { 'x-user-id': user.id } })
      if (res.ok) setNotifications(await res.json())
    } catch { }
  }
  useEffect(() => { fetchNotifs() }, [user])

  // Right sidebar only shows on main feed (not profile, not post detail)
  const showRightSidebar = !profileUser && !selectedPost

  useEffect(() => { document.body.setAttribute('data-theme', isDark ? 'dark' : 'light') }, [isDark])
  useEffect(() => { fetchAll() }, [selectedSub])

  // Handle shared post URLs: #/post/{id}
  const openSharedPost = () => {
    const match = window.location.hash.match(/^#\/post\/(.+)/)
    if (!match) return
    fetch(`${API}/posts/${match[1]}`).then(r => r.json()).then(d => { if (d && !d.error) setSelectedPost(d) }).catch(() => { })
    window.history.replaceState(null, '', '/')
  }
  useEffect(() => { openSharedPost(); window.addEventListener('hashchange', openSharedPost); return () => window.removeEventListener('hashchange', openSharedPost) }, [])

  const fetchAll = async (showLoader = true) => {
    // Stale-while-revalidate: show cached data instantly
    const cachedPosts = sessionStorage.getItem('ds:posts')
    const cachedSubs = sessionStorage.getItem('ds:subs')
    if (cachedPosts && cachedSubs && showLoader) {
      try {
        setPosts(selectedSub ? [] : JSON.parse(cachedPosts))
        setSubreddits(JSON.parse(cachedSubs))
        setLoading(false)
      } catch { }
    } else if (showLoader) {
      setLoading(true)
    }
    try {
      const [pr, sr] = await Promise.all([fetch(selectedSub ? `${API}/subreddits/${selectedSub}` : `${API}/posts`), fetch(`${API}/subreddits`)])
      const pd = await pr.json(), sd = await sr.json()
      const newPosts = selectedSub ? (pd.posts ?? []) : pd
      setPosts(newPosts); setSubreddits(sd)
      // Cache for next visit
      if (!selectedSub) sessionStorage.setItem('ds:posts', JSON.stringify(newPosts))
      sessionStorage.setItem('ds:subs', JSON.stringify(sd))
    } catch { toast.error('Failed to load') } finally { setLoading(false) }
  }

  const [submittingSub, setSubmittingSub] = useState(false)

  const submitSub = async (e) => {
    e.preventDefault(); if (submittingSub) return; setSubmittingSub(true); const tId = toast.loading('Creating...')
    try {
      const res = await fetch(`${API}/subreddits`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id }, body: JSON.stringify({ name: newSub.name, description: newSub.description }) })
      const d = await res.json(); if (!res.ok) { toast.error(d.error ?? 'Failed', { id: tId }); return }
      toast.success(`d/${newSub.name} created!`, { id: tId }); setShowCreateSub(false); setNewSub({ name: '', description: '' })
      joinedSubs.add(newSub.name); setJoinedSubs(new Set(joinedSubs))
      updateUser({ subscriptions: [...(user.subscriptions || []), { subredditId: d.id }] })
      fetchAll()
    } catch { toast.error('Failed to connect', { id: tId }) } finally { setSubmittingSub(false) }
  }

  const toggleJoin = async (n) => {
    if (!user) { setShowAuth(true); return; }
    const sub = subreddits.find(s => s.name === n);
    if (!sub) return;

    const prev = new Set(joinedSubs);
    const nx = new Set(prev);
    if (nx.has(n)) nx.delete(n); else nx.add(n);
    setJoinedSubs(nx);

    const oldSubs = user.subscriptions || [];
    const newSubs = nx.has(n)
      ? [...oldSubs, { subredditId: sub.id }]
      : oldSubs.filter(s => s.subredditId !== sub.id);
    updateUser({ subscriptions: newSubs });

    try {
      const res = await fetch(`${API}/subreddits/${n}/join`, { method: 'POST', headers: { 'x-user-id': user.id } });
      if (!res.ok) throw new Error();
      toast(nx.has(n) ? `Joined d/${n}!` : `Left d/${n}`);
      fetchAll();
    } catch {
      setJoinedSubs(prev);
      updateUser({ subscriptions: oldSubs });
      toast.error('Failed to update subscription');
    }
  }

  const displayPosts = [...posts]
    .filter(p => !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'top') return getScore(b.votes) - getScore(a.votes)
      if (sortBy === 'hot') return (getScore(b.votes) + (b._count?.comments ?? 0) * 2) - (getScore(a.votes) + (a._count?.comments ?? 0) * 2)
      return new Date(b.createdAt) - new Date(a.createdAt)
    })

  const navHome = () => { setSelectedSub(null); setSelectedPost(null); setProfileUser(null) }

  return (
    <div className="app">
      <Toaster position="bottom-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '13px' } }} />

      <nav className="navbar">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(s => !s)}>
            <Layers size={18} />
          </button>
          <button className="brand" onClick={navHome}><div className="logo-mark"><Layers size={15} strokeWidth={2.5} /></div><span className="logo-word">DevShare</span></button>
        </div>
        <div className="search-wrap">
          <Search size={14} className="s-icon" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search posts…" />
          {searchQuery && <button className="s-clear" onClick={() => setSearchQuery('')}><X size={12} /></button>}
        </div>
        <div className="nav-actions">
          <button className="icon-btn" onClick={() => setIsDark(d => !d)}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <div className="notif-wrap" style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => { if (!user) setShowAuth(true); else setShowNotifs(s => !s) }}>
              <Bell size={18} />
              {notifications.filter(n => !n.isRead).length > 0 && <span className="notif-badge">{notifications.filter(n => !n.isRead).length}</span>}
            </button>
            <AnimatePresence>
              {showNotifs && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="notif-dropdown">
                  <div className="notif-head">
                    <h4>Notifications</h4>
                    {notifications.some(n => !n.isRead) && <button className="mark-read-btn" onClick={async () => {
                      await fetch(`${API}/notifications/readAll`, { method: 'POST', headers: { 'x-user-id': user.id } });
                      fetchNotifs();
                    }}>Mark all read</button>}
                  </div>
                  <div className="notif-body">
                    {notifications.length === 0 ? <p className="notif-empty">No new notifications</p> :
                      notifications.map(n => (
                        <div key={n.id} className={`notif-item ${!n.isRead ? 'unread' : ''}`}
                          onClick={() => {
                            if (n.postId) {
                              // Fetch the post and navigate to it
                              fetch(`${API}/posts/${n.postId}`).then(r => r.json()).then(p => { if (p && !p.error) setSelectedPost(p) }).catch(() => { })
                              setShowNotifs(false)
                            }
                          }}
                          style={{ cursor: n.postId ? 'pointer' : 'default' }}>
                          <div className="notif-actor-avatar" style={{
                            width: 24, height: 24, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                            background: n.actor?.avatarUrl ? 'transparent' : (n.actor?.avatarColor ?? 'var(--primary)'),
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: 'white', fontWeight: 700
                          }}>
                            {n.actor?.avatarUrl
                              ? <img src={n.actor.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : n.actor?.username?.[0]?.toUpperCase()}
                          </div>
                          <div className="notif-text">
                            {n.type === 'POST_IN_SUBREDDIT' ? `u/${n.actor?.username} posted in a community you follow` : n.type === 'COMMENT_ON_POST' ? `u/${n.actor?.username} commented on your post` : `u/${n.actor?.username} replied to your comment`}
                          </div>
                          <span className="notif-time">{timeAgo(n.createdAt)}</span>
                        </div>
                      ))
                    }
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {user ? (
            <div className="user-menu-wrap">
              <button className="user-chip" onClick={() => setShowUserMenu(s => !s)}>
                <div className="user-avatar" style={{
                  background: user.avatarUrl ? 'transparent' : (user.avatarColor ?? 'var(--primary)'),
                  color: 'white', fontSize: 13, fontWeight: 700, overflow: 'hidden', padding: 0
                }}>
                  {user.avatarUrl
                    ? <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : user.username[0].toUpperCase()
                  }
                </div>
                <span>{user.username}</span>
                <ChevronDown size={13} />
              </button>
              <AnimatePresence>
                {showUserMenu && <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="user-dropdown" onMouseLeave={() => setShowUserMenu(false)}>
                  <button onClick={() => { setProfileUser(user.username); setShowUserMenu(false) }}>My Profile</button>
                  {user?.role === 'ADMIN' && (
                    <button onClick={() => { setShowAccessLogs(true); setShowUserMenu(false) }}>IP Access Logs</button>
                  )}
                  <button onClick={() => { logout(); setShowUserMenu(false); toast('Logged out') }}>Log Out</button>
                </motion.div>}
              </AnimatePresence>
            </div>
          ) : (
            <button className="login-btn" onClick={() => setShowAuth(true)}><LogIn size={16} /> Log in</button>
          )}
          <button className="create-btn" onClick={() => { if (!user) { setShowAuth(true); return }; setShowCreatePost(true) }}><Plus size={16} /> Create</button>
        </div>
      </nav>

      <div className={`body-grid ${leftCollapsed ? 'left-collapsed' : ''} ${!showRightSidebar ? 'no-right' : ''}`}>
        {mobileMenuOpen && <div className="modal-backdrop" style={{ zIndex: 99 }} onClick={() => setMobileMenuOpen(false)} />}
        <aside className={`sidebar-left ${leftCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'open' : ''}`}>
          <button className="collapse-btn" onClick={() => setLeftCollapsed(c => !c)} title={leftCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {leftCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          {!leftCollapsed && (
            <nav className="side-nav">
              <p className="side-label">FEEDS</p>
              <button className={`side-link ${!selectedSub && !profileUser ? 'active' : ''}`} onClick={navHome}><Home size={16} /> Home</button>
              <button className="side-link" onClick={() => { setSortBy('hot'); navHome() }}><Flame size={16} /> Popular</button>
              <button className="side-link" onClick={() => { setSortBy('new'); navHome() }}><TrendingUp size={16} /> New</button>
              <button className="side-link" onClick={() => { setSortBy('top'); navHome() }}><Award size={16} /> Top</button>
              <div className="side-divider" />
              <div className="side-label-row">
                <p className="side-label">COMMUNITIES</p>
                <button className="create-sub-btn" onClick={() => setShowCreateSub(true)}><Plus size={12} /></button>
              </div>
              {subreddits.map(sub => (
                <button key={sub.id} className={`side-link community-link ${selectedSub === sub.name ? 'active' : ''}`} onClick={() => { setSelectedSub(sub.name); setSelectedPost(null); setProfileUser(null) }}>
                  <div className="sub-icon">{sub.name[0].toUpperCase()}</div>
                  <div className="sub-link-info"><span>d/{sub.name}</span><small>{sub._count?.posts} posts</small></div>
                </button>
              ))}
            </nav>
          )}
        </aside>

        <main className="feed-area">
          <AnimatePresence mode="wait">
            {profileUser ? (
              <ProfilePage key="profile" username={profileUser} onBack={() => setProfileUser(null)} onPostClick={p => { setSelectedPost(p); setProfileUser(null) }} onUsernameChange={setProfileUser} onProfileSaved={fetchAll} />
            ) : selectedPost ? (
              <PostDetail key="detail" post={selectedPost} onBack={(updatedPost) => { setSelectedPost(null); if (updatedPost) setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p)) }} onAuthRequired={() => setShowAuth(true)} onAction={(type, post) => { setActionModal({ type, post }); if (type === 'EDIT_POST') { setActionTitle(post.title); setActionText(post.content || ''); } else if (type === 'EDIT_COMMENT') { setActionText(post.content || ''); } else { setActionText(''); setActionTitle(''); } }} onUserClick={setProfileUser} />
            ) : (
              <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="feed-header">
                  <h2>{selectedSub ? `d/${selectedSub}` : 'Home'}</h2>
                  {selectedSub && (user?.role === 'ADMIN' || subreddits.find(s => s.name === selectedSub)?.creator?.id === user?.id) && (
                    <>
                      <button className="action-btn" onClick={() => { const sub = subreddits.find(s => s.name === selectedSub); if (sub) { setSubDesc(sub.description || ''); fetch(`${API}/subreddits/${selectedSub}/members`).then(r => r.json()).then(setMembers).catch(() => toast.error('Failed to load members')); setShowSubSettings(true) } }} style={{ color: 'var(--text-2)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}><SettingsIcon size={14} /> Settings</button>
                      <button className="action-btn" onClick={() => setActionModal({ type: 'DELETE_SUB', post: { subreddit: { name: selectedSub } } })} style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}><X size={14} /> Delete</button>
                    </>
                  )}
                  <div className="sort-tabs">
                    {[{ id: 'hot', icon: <Flame size={13} />, label: 'Hot' }, { id: 'new', icon: <Clock size={13} />, label: 'New' }, { id: 'top', icon: <Award size={13} />, label: 'Top' }].map(s => (
                      <button key={s.id} className={`sort-tab ${sortBy === s.id ? 'active' : ''}`} onClick={() => setSortBy(s.id)}>{s.icon}{s.label}</button>
                    ))}
                    <button className="sort-tab" onClick={fetchAll}><RefreshCw size={13} /></button>
                  </div>
                </div>
                <div className="create-stub" onClick={() => { if (!user) { setShowAuth(true); return }; setShowCreatePost(true) }}>
                  <div className="stub-avatar" style={{ background: user?.avatarUrl ? 'transparent' : (user?.avatarColor ?? 'var(--primary)'), overflow: 'hidden' }}>{user?.avatarUrl ? <img src={user.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (user ? user.username[0].toUpperCase() : '?')}</div>
                  <div className="stub-input">{user ? "What's on your mind?" : 'Log in to post...'}</div>
                  <button className="stub-btn"><Plus size={15} /></button>
                </div>
                {loading
                  ? <div className="skeleton-list">{[1, 2, 3].map(n => <div key={n} className="skeleton" />)}</div>
                  : displayPosts.length === 0
                    ? <div className="empty-feed"><LayoutGrid size={40} /><p>No posts found</p><button className="btn-post" onClick={() => { if (!user) { setShowAuth(true); return }; setShowCreatePost(true) }}>Create first post</button></div>
                    : displayPosts.map(post => <PostCard key={post.id} post={post} onClick={() => setSelectedPost(post)} onAuthRequired={() => setShowAuth(true)} onAction={(type, p) => setActionModal({ type, post: p })} onUserClick={setProfileUser} />)
                }
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {showRightSidebar && (
          <aside className="sidebar-right">
            <div className="info-card">
              <div className="info-banner"><Layers size={26} color="white" opacity={0.4} /></div>
              <div className="info-body">
                <div className="info-brand"><Layers size={16} color="var(--primary)" /><h4>DevShare</h4></div>
                <p>Your community hub for developers.</p>
                {!user && <button className="btn-post w-full" onClick={() => setShowAuth(true)}><LogIn size={14} /> Join DevShare</button>}
                {user && <button className="btn-post w-full" onClick={() => setShowCreatePost(true)}><Plus size={14} /> Create Post</button>}
                <button className="btn-outline w-full" onClick={() => setShowCreateSub(true)}>Create Community</button>
              </div>
            </div>
            <div className="info-card">
              <div className="info-body">
                <h4 className="card-title">Top Communities</h4>
                {subreddits.slice(0, 6).map((sub, i) => (
                  <div key={sub.id} className="community-row">
                    <span className="rank">#{i + 1}</span>
                    <div className="sub-icon sm">{sub.name[0].toUpperCase()}</div>
                    <div className="sub-row-info">
                      <button className="sub-row-name" onClick={() => { setSelectedSub(sub.name); setSelectedPost(null); setProfileUser(null) }}>d/{sub.name}</button>
                      <small>{sub._count?.posts} posts</small>
                    </div>
                    <button className={`join-btn ${joinedSubs.has(sub.name) ? 'joined' : ''}`} onClick={() => toggleJoin(sub.name)}>{joinedSubs.has(sub.name) ? 'Joined' : 'Join'}</button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>

      <AnimatePresence>
        {showAuth && <AuthPage key="auth" onClose={() => setShowAuth(false)} />}
        {showCreatePost && (
          <CreatePostModal
            subreddits={subreddits}
            joinedSubs={joinedSubs}
            user={user}
            onClose={() => setShowCreatePost(false)}
            onSuccess={() => fetchAll()}
          />
        )}
        {showCreateSub && (
          <div className="modal-backdrop" onClick={() => setShowCreateSub(false)}>
            <motion.div className="modal" initial={{ scale: .95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .95, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-head"><h3>Create Community</h3><button onClick={() => setShowCreateSub(false)}><X size={18} /></button></div>
              <form onSubmit={submitSub} className="modal-body">
                <div className="prefix-input"><span>d/</span><input type="text" placeholder="name" value={newSub.name} onChange={e => setNewSub(p => ({ ...p, name: e.target.value.replace(/\s/g, '_') }))} required minLength={3} maxLength={21} /></div>
                <small className="input-hint">{newSub.name.length}/21</small>
                <textarea placeholder="Description (optional)" value={newSub.description} onChange={e => setNewSub(p => ({ ...p, description: e.target.value }))} rows={3} />
                <div className="modal-footer">
                  <button type="button" className="btn-outline" onClick={() => setShowCreateSub(false)}>Cancel</button>
                  <button type="submit" className="btn-post" disabled={submittingSub}>{submittingSub ? 'Creating...' : 'Create'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {showSubSettings && selectedSub && (
          <div className="modal-backdrop" onClick={() => setShowSubSettings(false)}>
            <motion.div className="modal modal-wide" initial={{ scale: .95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .95, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-head">
                <h3><SettingsIcon size={16} style={{ marginRight: 6 }} /> d/{selectedSub} Settings</h3>
                <button onClick={() => setShowSubSettings(false)}><X size={18} /></button>
              </div>
              <div className="modal-body" style={{ display: 'flex', gap: 0, padding: 0, maxHeight: '60vh' }}>
                <div className="settings-tabs" style={{ width: 140, borderRight: '1px solid var(--border)', padding: '12px 0', flexShrink: 0 }}>
                  {[{ id: 'info', label: 'Info', icon: <Edit3 size={14} /> }, { id: 'members', label: 'Members', icon: <Users size={14} /> }, { id: 'moderators', label: 'Moderators', icon: <Shield size={14} /> }].map(tab => (
                    <button key={tab.id} onClick={() => setSubSettingsTab(tab.id)} className={`settings-tab ${subSettingsTab === tab.id ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 16px', border: 'none', background: subSettingsTab === tab.id ? 'var(--surface-hover)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>{tab.icon}{tab.label}</button>
                  ))}
                </div>
                <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
                  {subSettingsTab === 'info' && (
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Description</label>
                      <textarea value={subDesc} onChange={e => setSubDesc(e.target.value)} rows={4} maxLength={500} style={{ width: '100%' }} />
                      <div className="modal-footer" style={{ marginTop: 12 }}>
                        <button className="btn-outline" onClick={() => setShowSubSettings(false)}>Cancel</button>
                        <button className="btn-post" onClick={async () => {
                          const tid = toast.loading('Saving...');
                          try { const r = await fetch(`${API}/subreddits/${selectedSub}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ description: subDesc }) }); if (r.ok) { toast.success('Saved!', { id: tid }); setShowSubSettings(false); fetchAll() } else throw Error() } catch { toast.error('Failed', { id: tid }) }
                        }}>Save</button>
                      </div>
                    </div>
                  )}
                  {subSettingsTab === 'members' && (
                    <div>
                      <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Members ({members.length})</h4>
                      {members.length === 0 ? <p style={{ color: 'var(--text-2)', fontSize: 13 }}>No members yet.</p> :
                        members.map(m => <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                          <div className="user-avatar" style={{ width: 28, height: 28, borderRadius: '50%', background: m.avatarUrl ? 'transparent' : (m.avatarColor ?? 'var(--primary)'), overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white', fontWeight: 700, flexShrink: 0 }}>{m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.username?.[0]?.toUpperCase()}</div>
                          <div style={{ flex: 1 }}><span style={{ fontSize: 13 }}>u/{m.username}</span> <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 4 }}>({m.role})</span></div>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.karma} karma</span>
                        </div>)
                      }
                    </div>
                  )}
                  {subSettingsTab === 'moderators' && (
                    <div>
                      <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Moderators</h4>
                      {members.filter(m => m.role === 'OWNER' || m.role === 'MODERATOR').map(m => <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <div className="user-avatar" style={{ width: 28, height: 28, borderRadius: '50%', background: m.avatarUrl ? 'transparent' : (m.avatarColor ?? 'var(--primary)'), overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white', fontWeight: 700, flexShrink: 0 }}>{m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.username?.[0]?.toUpperCase()}</div>
                        <div style={{ flex: 1 }}><span style={{ fontSize: 13 }}>u/{m.username}</span> <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 4 }}>{m.role === 'OWNER' ? <><Crown size={11} style={{ color: '#f59e0b', display: 'inline' }} /> Owner</> : 'Moderator'}</span></div>
                        {m.role === 'MODERATOR' && (user?.role === 'ADMIN' || subreddits.find(s => s.name === selectedSub)?.creator?.id === user?.id) && (
                          <button className="btn-outline" style={{ padding: '3px 8px', fontSize: 11, color: 'var(--red)' }} onClick={async () => { const tid = toast.loading('Removing...'); try { const r = await fetch(`${API}/subreddits/${selectedSub}/moderators/${m.id}`, { method: 'DELETE', headers: { 'x-user-id': user.id } }); if (r.ok) { toast.success('Removed', { id: tid }); fetch(`${API}/subreddits/${selectedSub}/members`).then(r => r.json()).then(setMembers).catch(() => { }) } else throw Error() } catch { toast.error('Failed', { id: tid }) } }}>Remove</button>
                        )}
                      </div>)}
                      {user?.role === 'ADMIN' || subreddits.find(s => s.name === selectedSub)?.creator?.id === user?.id ? <div style={{ marginTop: 16 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>Add a moderator by user ID:</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input ref={modAddRef} placeholder="User ID..." style={{ flex: 1 }} onKeyDown={async (e) => { if (e.key !== 'Enter') return; const inp = e.target; const uid = inp.value.trim(); if (!uid) return; const tid = toast.loading('Adding...'); try { const r = await fetch(`${API}/subreddits/${selectedSub}/moderators`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ userId: uid }) }); const d = await r.json(); if (r.ok) { toast.success(d.message, { id: tid }); inp.value = ''; fetch(`${API}/subreddits/${selectedSub}/members`).then(r => r.json()).then(setMembers).catch(() => { }) } else toast.error(d.error || 'Failed', { id: tid }) } catch { toast.error('Failed', { id: tid }) } }} />
                          <button className="btn-post" style={{ padding: '6px 12px', fontSize: 12 }} onClick={async () => { const inp = modAddRef.current; if (!inp) return; const uid = inp.value.trim(); if (!uid) return; const tid = toast.loading('Adding...'); try { const r = await fetch(`${API}/subreddits/${selectedSub}/moderators`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ userId: uid }) }); const d = await r.json(); if (r.ok) { toast.success(d.message, { id: tid }); inp.value = ''; fetch(`${API}/subreddits/${selectedSub}/members`).then(r => r.json()).then(setMembers).catch(() => { }) } else toast.error(d.error || 'Failed', { id: tid }) } catch { toast.error('Failed', { id: tid }) } }}>Add</button>
                        </div>
                      </div> : null}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {actionModal && (
          <div className="modal-backdrop" onClick={() => setActionModal(null)}>
            <motion.div className="modal" initial={{ scale: .95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .95, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-head">
                <h3>{actionModal.type === 'REPORT' ? 'Report Post' : actionModal.type === 'DELETE' ? 'Confirm Deletion' : actionModal.type === 'DELETE_SUB' ? 'Delete Community' : actionModal.type === 'DELETE_COMMENT' ? 'Delete Comment' : actionModal.type === 'EDIT_POST' ? 'Edit Post' : actionModal.type === 'EDIT_COMMENT' ? 'Edit Comment' : 'Add Community Note'}</h3>
                <button onClick={() => setActionModal(null)}><X size={18} /></button>
              </div>
              <div className="modal-body">
                {(actionModal.type === 'DELETE' || actionModal.type === 'DELETE_COMMENT') ? (
                  <p>Are you sure you want to permanently delete this? This action cannot be undone.</p>
                ) : actionModal.type === 'DELETE_SUB' ? (
                  <p>Are you sure you want to permanently delete d/{actionModal.post.subreddit.name}? This action cannot be undone.</p>
                ) : (
                  <>
                    {actionModal.type === 'EDIT_POST' && (
                      <input type="text" placeholder="Title *" value={actionTitle} onChange={e => setActionTitle(e.target.value)} required style={{ marginBottom: 10 }} />
                    )}
                    <textarea
                      autoFocus
                      placeholder={actionModal.type === 'REPORT' ? "Reason for reporting..." : actionModal.type.startsWith('EDIT') ? "Content..." : "Enter your community note..."}
                      value={actionText}
                      onChange={e => setActionText(e.target.value)}
                      rows={4}
                    />
                  </>
                )}
                <div className="modal-footer" style={{ marginTop: 16 }}>
                  <button className="btn-outline" onClick={() => setActionModal(null)}>Cancel</button>
                  <button
                    className="btn-post"
                    style={{ background: (actionModal.type.startsWith('DELETE')) ? 'var(--red)' : 'var(--primary)' }}
                    onClick={async () => {
                      const { type, post } = actionModal;
                      const tid = toast.loading('Processing...');
                      try {
                        if (type === 'REPORT') {
                          if (!actionText.trim()) return toast.error('Reason required', { id: tid });
                          await fetch(`${API}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ type: 'POST', targetId: post.id, reason: actionText }) });
                          toast.success('Report sent!', { id: tid });
                        } else if (type === 'DELETE') {
                          await fetch(`${API}/posts/${post.id}`, { method: 'DELETE', headers: { 'x-user-id': user.id } });
                          toast.success('Post deleted', { id: tid });
                          setSelectedPost(null);
                          fetchAll(false);
                        } else if (type === 'DELETE_COMMENT') {
                          await fetch(`${API}/comments/${post.id}`, { method: 'DELETE', headers: { 'x-user-id': user.id } });
                          toast.success('Comment deleted', { id: tid });
                          if (selectedPost) setSelectedPost({ ...selectedPost }); // force reload
                        } else if (type === 'DELETE_SUB') {
                          await fetch(`${API}/subreddits/${post.subreddit.name}`, { method: 'DELETE', headers: { 'x-user-id': user.id } });
                          toast.success('Community deleted', { id: tid });
                          navHome();
                          fetchAll(false);
                        } else if (type === 'NOTE') {
                          if (!actionText.trim()) return toast.error('Note required', { id: tid });
                          await fetch(`${API}/posts/${post.id}/note`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ communityNote: actionText }) });
                          toast.success('Note added!', { id: tid });
                          if (selectedPost) setSelectedPost({ ...selectedPost, communityNote: actionText });
                          fetchAll(false);
                        } else if (type === 'EDIT_POST') {
                          if (!actionTitle.trim()) return toast.error('Title required', { id: tid });
                          const res = await fetch(`${API}/posts/${post.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ title: actionTitle, content: actionText }) });
                          if (res.ok) {
                            const updated = await res.json();
                            toast.success('Post updated', { id: tid });
                            if (selectedPost) setSelectedPost(updated);
                            fetchAll(false);
                          } else throw new Error();
                        } else if (type === 'EDIT_COMMENT') {
                          if (!actionText.trim()) return toast.error('Content required', { id: tid });
                          const res = await fetch(`${API}/comments/${post.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ content: actionText }) });
                          if (res.ok) {
                            toast.success('Comment updated', { id: tid });
                            if (selectedPost) setSelectedPost({ ...selectedPost }); // Force reload comments
                          } else throw new Error();
                        }
                        setActionModal(null); setActionText(''); setActionTitle('');
                      } catch { toast.error('Action failed', { id: tid }); }
                    }}
                  >
                    {(actionModal.type.startsWith('DELETE')) ? 'Delete' : 'Submit'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {showAccessLogs && (
          <AccessLogsModal onClose={() => setShowAccessLogs(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}



