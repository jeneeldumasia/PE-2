import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

function App() {
  const [feedbackList, setFeedbackList] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')

  const [activeFeedback, setActiveFeedback] = useState(null)
  const [comments, setComments] = useState([])
  const [commentEmail, setCommentEmail] = useState('')
  const [commentText, setCommentText] = useState('')

  const [sortBy, setSortBy] = useState('upvotes')
  const [adminToken, setAdminToken] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState('Open')
  const allowedStatuses = ['Open', 'Planned', 'In Progress', 'Completed']
  const sortedFeedback = useMemo(() => {
    return [...feedbackList]
  }, [feedbackList])

  useEffect(() => {
    fetchFeedback()
  }, [])

  async function fetchFeedback(nextSortBy = sortBy) {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ sortBy: nextSortBy }).toString()
      const res = await fetch(`${API_BASE}/api/feedback?${query}`)
      if (!res.ok) throw new Error('Failed to load feedback')
      const data = await res.json()
      setFeedbackList(data)
    } catch (e) {
      setError(e.message || 'Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  async function submitFeedback(e) {
    e.preventDefault()
    setError('')
    if (!title.trim() || !description.trim() || !email.trim()) {
      setError('All fields are required')
      return
    }
    if (!isValidEmail(email)) {
      setError('Please enter a valid email')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, user_email: email })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to submit feedback')
      }
      await fetchFeedback()
      setTitle('')
      setDescription('')
      setEmail('')
    } catch (e) {
      setError(e.message)
    }
  }

  async function upvote(feedback) {
    const voter = window.prompt('Enter your email to upvote:')
    if (!voter) return
    if (!isValidEmail(voter)) {
      alert('Invalid email format')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/feedback/${feedback.id}/upvote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: voter })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(body.error || 'Failed to upvote')
        return
      }
      await fetchFeedback()
    } catch (e) {
      alert('Failed to upvote')
    }
  }

  async function openComments(feedback) {
    setActiveFeedback(feedback)
    setComments([])
    setCommentEmail('')
    setCommentText('')
    try {
      const res = await fetch(`${API_BASE}/api/feedback/${feedback.id}/comments`)
      if (!res.ok) throw new Error('Failed to load comments')
      const data = await res.json()
      setComments(data)
    } catch (e) {
      alert(e.message)
    }
  }

  async function addComment(e) {
    e.preventDefault()
    if (!activeFeedback) return
    if (!commentEmail.trim() || !commentText.trim()) {
      alert('Email and comment are required')
      return
    }
    if (!isValidEmail(commentEmail)) {
      alert('Invalid email format')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/feedback/${activeFeedback.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: commentEmail, comment_text: commentText })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(body.error || 'Failed to add comment')
        return
      }
      setCommentText('')
      // Refresh comments
      const res2 = await fetch(`${API_BASE}/api/feedback/${activeFeedback.id}/comments`)
      const data2 = await res2.json()
      setComments(data2)
      // Also refresh counts in list
      fetchFeedback()
    } catch (e) {
      alert('Failed to add comment')
    }
  }

  function startEdit(feedback) {
    setEditingId(feedback.id)
    setEditTitle(feedback.title)
    setEditDescription(feedback.description)
    setEditStatus(feedback.status || 'Open')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditTitle('')
    setEditDescription('')
    setEditStatus('Open')
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!editingId) return
    if (!adminToken) {
      alert('Admin token required')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/feedback/${editingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({ title: editTitle, description: editDescription, status: editStatus })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(body.error || 'Failed to update feedback')
        return
      }
      cancelEdit()
      fetchFeedback()
    } catch (err) {
      alert('Failed to update feedback')
    }
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>Product Feedback</h1>
          <p>Share ideas, upvote what matters, and join the discussion.</p>
        </div>
        <div className="row">
          <span className="badge">Total Ideas {feedbackList.length}</span>
          <form onSubmit={async (e) => {
            e.preventDefault()
            try {
              const res = await fetch(`${API_BASE}/api/admin/verify`, { headers: { 'x-admin-token': adminToken }})
              if (res.ok) {
                setIsAdmin(true)
              } else {
                setIsAdmin(false)
                alert('Invalid admin token')
              }
            } catch {
              setIsAdmin(false)
              alert('Verification failed')
            }
          }} className="row" style={{ gap: 8 }}>
            <input
              value={adminToken}
              onChange={(e) => { setAdminToken(e.target.value); setIsAdmin(false) }}
              placeholder="Admin token"
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
            <button type="submit" className="btn ghost">Verify</button>
            {isAdmin && <span className="badge">Admin Verified</span>}
          </form>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); fetchFeedback(e.target.value) }}
            style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
          >
            <option value="upvotes">Most Popular</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>
      <div className="card">
        <h2>Submit Feedback</h2>
        {error && <div style={{ color: '#b91c1c' }}>{error}</div>}
        <form onSubmit={submitFeedback} className="form-grid">
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" />
          </label>
          <label>
            Your Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label style={{ gridColumn: '1 / span 2' }}>
            Description
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your idea or issue" />
          </label>
          <div className="row" style={{ gridColumn: '1 / span 2', justifyContent: 'flex-end' }}>
            <button className="btn" type="submit" disabled={loading}>Submit</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Feedback</h2>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sortedFeedback.map((f) => (
              <div key={f.id}>
                <div className="feedback-item">
                  <div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <h3 className="feedback-title" onClick={() => openComments(f)}>{f.title}</h3>
                      <span className={`status-badge ${
                        (f.status || 'Open').toLowerCase().replace(' ', '-') === 'open' ? 'status-open' :
                        (f.status || 'Open').toLowerCase().replace(' ', '-') === 'planned' ? 'status-planned' :
                        (f.status || 'Open').toLowerCase().replace(' ', '-') === 'in-progress' ? 'status-in-progress' :
                        'status-completed'
                      }`}>{f.status || 'Open'}</span>
                    </div>
                    <p className="feedback-desc">{f.description}</p>
                    <div className="counts">
                      <span className="badge">👍 {f.upvote_count}</span>
                      <span className="badge">💬 {f.comment_count}</span>
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn" onClick={() => upvote(f)}>Upvote</button>
                    <button className="btn ghost" onClick={() => openComments(f)}>View Comments</button>
                    {isAdmin && (
                      editingId === f.id ? (
                        <button className="btn secondary" onClick={cancelEdit}>Cancel</button>
                      ) : (
                        <button className="btn secondary" onClick={() => startEdit(f)}>Edit</button>
                      )
                    )}
                    {isAdmin && (
                      <button
                        className="btn secondary"
                        onClick={async () => {
                          if (!confirm('Delete this feedback? This cannot be undone.')) return
                          try {
                            const res = await fetch(`${API_BASE}/api/feedback/${f.id}`, {
                              method: 'DELETE',
                              headers: { 'x-admin-token': adminToken }
                            })
                            if (!res.ok) {
                              const body = await res.json().catch(() => ({}))
                              alert(body.error || 'Failed to delete')
                              return
                            }
                            if (editingId === f.id) cancelEdit()
                            fetchFeedback()
                          } catch {
                            alert('Failed to delete')
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {isAdmin && editingId === f.id && (
                  <form onSubmit={saveEdit} className="form-grid" style={{ marginTop: 12 }}>
                    <label>
                      Title
                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    </label>
                    <label>
                      Status
                      <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                        {allowedStatuses.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ gridColumn: '1 / span 2' }}>
                      Description
                      <textarea rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                    </label>
                    <div className="row" style={{ gridColumn: '1 / span 2', justifyContent: 'flex-end' }}>
                      <button className="btn" type="submit">Save</button>
                    </div>
                  </form>
                )}
              </div>
            ))}
            {!sortedFeedback.length && <div>No feedback yet. Be the first to add one!</div>}
          </div>
        )}
      </div>

      {activeFeedback && (
        <div className="card">
          <h2>Comments</h2>
          <h3 style={{ margin: 0 }}>{activeFeedback.title}</h3>
          <p className="feedback-desc">{activeFeedback.description}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                <div style={{ fontWeight: 600 }}>{c.user_email}</div>
                <div>{c.comment_text}</div>
              </div>
            ))}
            {!comments.length && <div>No comments yet.</div>}
          </div>

          <form onSubmit={addComment} className="form-grid" style={{ marginTop: 12 }}>
            <label>
              Your Email
              <input value={commentEmail} onChange={(e) => setCommentEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label>
              Comment
              <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment" />
            </label>
            <div className="row" style={{ gridColumn: '1 / span 2', justifyContent: 'flex-end' }}>
              <button className="btn" type="submit">Add Comment</button>
            </div>
          </form>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn secondary" onClick={() => setActiveFeedback(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
