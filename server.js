const express = require('express');
const fileUpload = require('express-fileupload');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();

// Configure CORS for session cookies across ports (e.g., LiveServer 5500 & Node 3000)
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ createParentPath: true }));

// Express Session Setup
app.use(session({
  secret: 'super-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 
  }
}));

app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], files: [] }, null, 2));
}

// Simple JSON Helper DB
const getDb = () => JSON.parse(fs.readFileSync(DB_FILE));
const saveDb = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Middleware: Require Auth
const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
  next();
};

// --- AUTH ROUTES ---

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  const db = getDb();

  if (db.users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'User already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { id: Date.now().toString(), email, password: hashedPassword };

  db.users.push(newUser);
  saveDb(db);

  req.session.userId = newUser.id;
  req.session.userEmail = newUser.email;
  res.json({ message: 'Registered successfully!' });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const db = getDb();
  const user = db.users.find(u => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  req.session.userEmail = user.email;
  res.json({ message: 'Logged in successfully!' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

app.get('/api/user', (req, res) => {
  if (req.session.userId) {
    res.json({ id: req.session.userId, email: req.session.userEmail });
  } else {
    res.status(401).json({ message: 'Not logged in' });
  }
});

// --- FILE MANAGEMENT ROUTES ---

app.post('/upload', requireAuth, (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files received.');
  }

  const db = getDb();
  let uploadedFiles = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

  const userDir = path.join(UPLOADS_DIR, req.session.userId);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  uploadedFiles.forEach(file => {
    const fileId = Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7);
    const storedFileName = `${fileId}_${file.name}`;
    const savePath = path.join(userDir, storedFileName);

    file.mv(savePath, (err) => {
      if (!err) {
        db.files.push({
          id: fileId,
          userId: req.session.userId,
          originalName: file.name,
          storedFileName: storedFileName
        });
        saveDb(db);
      }
    });
  });

  res.send('Uploaded successfully');
});

app.get('/api/files', requireAuth, (req, res) => {
  const db = getDb();
  const userFiles = db.files.filter(f => f.userId === req.session.userId);
  res.json(userFiles);
});

app.get('/files/:fileId', requireAuth, (req, res) => {
  const db = getDb();
  const fileRecord = db.files.find(f => f.id === req.params.fileId && f.userId === req.session.userId);

  if (!fileRecord) return res.status(404).send('File not found');

  const filePath = path.join(UPLOADS_DIR, req.session.userId, fileRecord.storedFileName);
  res.sendFile(filePath);
});

app.delete('/api/files/:fileId', requireAuth, (req, res) => {
  const db = getDb();
  const fileIndex = db.files.findIndex(f => f.id === req.params.fileId && f.userId === req.session.userId);

  if (fileIndex === -1) return res.status(404).json({ message: 'File not found' });

  const fileRecord = db.files[fileIndex];
  const filePath = path.join(UPLOADS_DIR, req.session.userId, fileRecord.storedFileName);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  db.files.splice(fileIndex, 1);
  saveDb(db);

  res.json({ message: 'File deleted' });
});

app.listen(3000, () => console.log('🚀 Drive server active at http://localhost:3000'));