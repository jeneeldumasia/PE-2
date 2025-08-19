const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Initialize SQLite database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Create tables if not exist
db.serialize(() => {
	db.run(`CREATE TABLE IF NOT EXISTS feedback (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		description TEXT NOT NULL,
		user_email TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		status TEXT DEFAULT 'Open'
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS upvotes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		feedback_id INTEGER,
		user_email TEXT NOT NULL,
		UNIQUE (feedback_id, user_email),
		FOREIGN KEY (feedback_id) REFERENCES feedback(id)
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS comments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		feedback_id INTEGER,
		user_email TEXT NOT NULL,
		comment_text TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (feedback_id) REFERENCES feedback(id)
	)`);

	// Attempt to add status column if DB existed before
	db.run(`ALTER TABLE feedback ADD COLUMN status TEXT DEFAULT 'Open'`, (err) => {
		// Ignore error if column already exists
	});
});

function isValidEmail(email) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// GET /api/feedback
app.get('/api/feedback', (req, res) => {
	const sortBy = (req.query.sortBy || 'upvotes').toString().toLowerCase();
	const orderClause = sortBy === 'newest' ? 'f.created_at DESC' : 'upvote_count DESC, f.created_at DESC';

	const query = `
		SELECT f.id, f.title, f.description, f.user_email, f.created_at, f.status,
			COALESCE(u.upvote_count, 0) AS upvote_count,
			COALESCE(c.comment_count, 0) AS comment_count
		FROM feedback f
		LEFT JOIN (
			SELECT feedback_id, COUNT(*) AS upvote_count
			FROM upvotes
			GROUP BY feedback_id
		) u ON f.id = u.feedback_id
		LEFT JOIN (
			SELECT feedback_id, COUNT(*) AS comment_count
			FROM comments
			GROUP BY feedback_id
		) c ON f.id = c.feedback_id
		ORDER BY ${orderClause}
	`;

	db.all(query, [], (err, rows) => {
		if (err) {
			return res.status(500).json({ error: 'Failed to fetch feedback' });
		}
		res.json(rows);
	});
});

// POST /api/feedback
app.post('/api/feedback', (req, res) => {
	const { title, description, user_email } = req.body || {};
	if (!title || !description || !user_email) {
		return res.status(400).json({ error: 'title, description, and user_email are required' });
	}
	if (!isValidEmail(user_email)) {
		return res.status(400).json({ error: 'Invalid email format' });
	}

	const stmt = `INSERT INTO feedback (title, description, user_email) VALUES (?, ?, ?)`;
	db.run(stmt, [title, description, user_email], function (err) {
		if (err) {
			return res.status(500).json({ error: 'Failed to create feedback' });
		}
		db.get(`SELECT id, title, description, user_email, created_at, status FROM feedback WHERE id = ?`, [this.lastID], (getErr, row) => {
			if (getErr) {
				return res.status(500).json({ error: 'Failed to retrieve created feedback' });
			}
			res.status(201).json({ ...row, upvote_count: 0, comment_count: 0 });
		});
	});
});

// Simple admin auth via header token
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';
function requireAdmin(req, res, next) {
	const token = req.header('x-admin-token');
	if (!token || token !== ADMIN_TOKEN) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	return next();
}

const ALLOWED_STATUSES = new Set(['Open', 'Planned', 'In Progress', 'Completed']);

// PUT /api/feedback/:id (admin only)
app.put('/api/feedback/:id', requireAdmin, (req, res) => {
	const feedbackId = Number(req.params.id);
	if (!feedbackId) {
		return res.status(400).json({ error: 'Valid feedback id is required' });
	}
	const { title, description, status } = req.body || {};

	if (status !== undefined && !ALLOWED_STATUSES.has(status)) {
		return res.status(400).json({ error: 'Invalid status value' });
	}

	const fields = [];
	const values = [];
	if (title !== undefined) { fields.push('title = ?'); values.push(title); }
	if (description !== undefined) { fields.push('description = ?'); values.push(description); }
	if (status !== undefined) { fields.push('status = ?'); values.push(status); }

	if (fields.length === 0) {
		return res.status(400).json({ error: 'No fields to update' });
	}

	const sql = `UPDATE feedback SET ${fields.join(', ')} WHERE id = ?`;
	values.push(feedbackId);

	db.run(sql, values, function (err) {
		if (err) {
			return res.status(500).json({ error: 'Failed to update feedback' });
		}
		db.get(`SELECT id, title, description, user_email, created_at, status FROM feedback WHERE id = ?`, [feedbackId], (getErr, row) => {
			if (getErr || !row) {
				return res.status(500).json({ error: 'Failed to retrieve updated feedback' });
			}
			return res.json(row);
		});
	});
});

// GET /api/admin/verify - simple token verification
app.get('/api/admin/verify', requireAdmin, (req, res) => {
	return res.json({ ok: true });
});

// DELETE /api/feedback/:id (admin only)
app.delete('/api/feedback/:id', requireAdmin, (req, res) => {
	const feedbackId = Number(req.params.id);
	if (!feedbackId) {
		return res.status(400).json({ error: 'Valid feedback id is required' });
	}

	db.serialize(() => {
		db.run(`DELETE FROM upvotes WHERE feedback_id = ?`, [feedbackId], function (err) {
			if (err) {
				return res.status(500).json({ error: 'Failed to delete upvotes' });
			}
			db.run(`DELETE FROM comments WHERE feedback_id = ?`, [feedbackId], function (err2) {
				if (err2) {
					return res.status(500).json({ error: 'Failed to delete comments' });
				}
				db.run(`DELETE FROM feedback WHERE id = ?`, [feedbackId], function (err3) {
					if (err3) {
						return res.status(500).json({ error: 'Failed to delete feedback' });
					}
					if (this.changes === 0) {
						return res.status(404).json({ error: 'Feedback not found' });
					}
					return res.json({ ok: true });
				});
			});
		});
	});
});

// POST /api/feedback/:id/upvote
app.post('/api/feedback/:id/upvote', (req, res) => {
	const feedbackId = Number(req.params.id);
	const { user_email } = req.body || {};
	if (!feedbackId || !user_email) {
		return res.status(400).json({ error: 'feedback id and user_email are required' });
	}
	if (!isValidEmail(user_email)) {
		return res.status(400).json({ error: 'Invalid email format' });
	}

	const insert = `INSERT INTO upvotes (feedback_id, user_email) VALUES (?, ?)`;
	db.run(insert, [feedbackId, user_email], function (err) {
		if (err) {
			if (err && /UNIQUE constraint failed/.test(err.message)) {
				return res.status(409).json({ error: 'User has already upvoted this feedback' });
			}
			return res.status(500).json({ error: 'Failed to upvote' });
		}
		db.get(`SELECT COUNT(*) AS upvote_count FROM upvotes WHERE feedback_id = ?`, [feedbackId], (countErr, row) => {
			if (countErr) {
				return res.status(500).json({ error: 'Failed to retrieve upvote count' });
			}
			res.json({ message: 'Upvoted successfully', upvote_count: row.upvote_count });
		});
	});
});

// POST /api/feedback/:id/comments
app.post('/api/feedback/:id/comments', (req, res) => {
	const feedbackId = Number(req.params.id);
	const { user_email, comment_text } = req.body || {};
	if (!feedbackId || !user_email || !comment_text) {
		return res.status(400).json({ error: 'feedback id, user_email, and comment_text are required' });
	}
	if (!isValidEmail(user_email)) {
		return res.status(400).json({ error: 'Invalid email format' });
	}

	const insert = `INSERT INTO comments (feedback_id, user_email, comment_text) VALUES (?, ?, ?)`;
	db.run(insert, [feedbackId, user_email, comment_text], function (err) {
		if (err) {
			return res.status(500).json({ error: 'Failed to add comment' });
		}
		db.get(`SELECT id, feedback_id, user_email, comment_text, created_at FROM comments WHERE id = ?`, [this.lastID], (getErr, row) => {
			if (getErr) {
				return res.status(500).json({ error: 'Failed to retrieve created comment' });
			}
			res.status(201).json(row);
		});
	});
});

// GET /api/feedback/:id/comments
app.get('/api/feedback/:id/comments', (req, res) => {
	const feedbackId = Number(req.params.id);
	if (!feedbackId) {
		return res.status(400).json({ error: 'feedback id is required' });
	}
	db.all(
		`SELECT id, feedback_id, user_email, comment_text, created_at FROM comments WHERE feedback_id = ? ORDER BY created_at ASC`,
		[feedbackId],
		(err, rows) => {
			if (err) {
				return res.status(500).json({ error: 'Failed to fetch comments' });
			}
			return res.json(rows);
		}
	);
});

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});


