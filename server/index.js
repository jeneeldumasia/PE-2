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
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
});

function isValidEmail(email) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// GET /api/feedback
app.get('/api/feedback', (req, res) => {
	const query = `
		SELECT f.id, f.title, f.description, f.user_email, f.created_at,
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
		ORDER BY upvote_count DESC, f.created_at DESC
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
		db.get(`SELECT id, title, description, user_email, created_at FROM feedback WHERE id = ?`, [this.lastID], (getErr, row) => {
			if (getErr) {
				return res.status(500).json({ error: 'Failed to retrieve created feedback' });
			}
			res.status(201).json({ ...row, upvote_count: 0, comment_count: 0 });
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


