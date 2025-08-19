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

  const sortedFeedback = useMemo(() => {
    return [...feedbackList].sort((a, b) => b.upvote_count - a.upvote_count)
  }, [feedbackList])

  useEffect(() => {
    fetchFeedback()
  }, [])

  async function fetchFeedback() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/feedback`)
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

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>Product Feedback</h1>
          <p>Share ideas, upvote what matters, and join the discussion.</p>
        </div>
        <div className="row">
          <span className="badge">Total Ideas {feedbackList.length}</span>
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
              <div key={f.id} className="feedback-item">
                <div>
                  <h3 className="feedback-title" onClick={() => openComments(f)}>{f.title}</h3>
                  <p className="feedback-desc">{f.description}</p>
                  <div className="counts">
                    <span className="badge">👍 {f.upvote_count}</span>
                    <span className="badge">💬 {f.comment_count}</span>
                  </div>
                </div>
                <div className="row">
                  <button className="btn" onClick={() => upvote(f)}>Upvote</button>
                  <button className="btn ghost" onClick={() => openComments(f)}>View Comments</button>
                </div>
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
