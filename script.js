// --- IndexedDB Configuration for File Storage ---
const DB_NAME = 'ClientDriveDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFileToDB(fileRecord) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(fileRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getUserFilesFromDB(userId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const allFiles = request.result || [];
      resolve(allFiles.filter(f => f.userId === userId));
    };
    request.onerror = () => reject(request.error);
  });
}

async function getFileByIdFromDB(fileId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(fileId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFileFromDB(fileId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(fileId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Auth State Management (localStorage) ---
let isRegisterMode = false;
let currentUser = null;

const authContainer = document.getElementById('auth-container');
const driveContainer = document.getElementById('drive-container');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

// File Upload Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const dropText = document.getElementById('drop-text');
const stagedListContainer = document.getElementById('staged-list-container');
const serverFileList = document.getElementById('server-file-list');
const actionBar = document.getElementById('action-bar');
const uploadBtn = document.getElementById('upload-btn');

let selectedFiles = [];

// Helper: Hashing passwords via Web Crypto API
async function hashPassword(password) {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Auth Toggle & Submission ---

authToggleBtn.addEventListener('click', (e) => {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  authTitle.textContent = isRegisterMode ? 'Register New Account' : 'Login to Drive';
  authSubmitBtn.textContent = isRegisterMode ? 'Register' : 'Login';
  authToggleText.textContent = isRegisterMode ? 'Already have an account?' : 'Need an account?';
  authToggleBtn.textContent = isRegisterMode ? 'Login' : 'Register';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const users = JSON.parse(localStorage.getItem('users') || '[]');

  const hashedPassword = await hashPassword(password);

  if (isRegisterMode) {
    if (users.find(u => u.email === email)) {
      alert('User already exists');
      return;
    }
    const newUser = { id: Date.now().toString(), email, password: hashedPassword };
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    localStorage.setItem('activeSession', JSON.stringify({ id: newUser.id, email: newUser.email }));
    alert('Registered successfully!');
  } else {
    const user = users.find(u => u.email === email && u.password === hashedPassword);
    if (!user) {
      alert('Invalid credentials');
      return;
    }
    localStorage.setItem('activeSession', JSON.stringify({ id: user.id, email: user.email }));
    alert('Logged in successfully!');
  }

  authForm.reset();
  checkSession();
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('activeSession');
  checkSession();
});

function checkSession() {
  const session = JSON.parse(localStorage.getItem('activeSession'));
  if (session && session.id) {
    currentUser = session;
    authContainer.style.display = 'none';
    driveContainer.style.display = 'flex';
    userDisplay.textContent = currentUser.email;
    loadFiles();
  } else {
    currentUser = null;
    authContainer.style.display = 'block';
    driveContainer.style.display = 'none';
  }
}
checkSession();

// --- Local File Staging ---

browseBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  addFiles(e.target.files);
  fileInput.value = '';
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
});

['dragenter', 'dragover'].forEach(evt => {
  dropZone.addEventListener(evt, () => dropZone.classList.add('drag-over'));
});

['dragleave', 'drop'].forEach(evt => {
  dropZone.addEventListener(evt, () => dropZone.classList.remove('drag-over'));
});

dropZone.addEventListener('drop', (e) => {
  addFiles(e.dataTransfer.files);
});

function addFiles(files) {
  for (let i = 0; i < files.length; i++) {
    selectedFiles.push(files[i]);
  }
  renderStagedFiles();
}

window.removeStagedFile = function(index) {
  selectedFiles.splice(index, 1);
  renderStagedFiles();
};

function renderStagedFiles() {
  stagedListContainer.innerHTML = '';
  if (selectedFiles.length === 0) {
    dropText.textContent = 'Drag files here to add them to your account';
    actionBar.style.display = 'none';
    return;
  }

  dropText.textContent = 'Drag additional files here to add them to your repository';
  actionBar.style.display = 'flex';

  selectedFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <div class="file-info"><span>${file.name}</span></div>
      <button class="remove-btn" onclick="removeStagedFile(${index})">&times;</button>
    `;
    stagedListContainer.appendChild(item);
  });
}

// --- Storing Files to IndexedDB ---

uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0 || !currentUser) return;

  for (const file of selectedFiles) {
    const fileId = Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7);
    const fileRecord = {
      id: fileId,
      userId: currentUser.id,
      originalName: file.name,
      blob: file
    };
    await saveFileToDB(fileRecord);
  }

  selectedFiles = [];
  renderStagedFiles();
  loadFiles();
});

// --- Displaying and Downloading Saved Files ---

async function loadFiles() {
  if (!currentUser) return;

  const files = await getUserFilesFromDB(currentUser.id);
  serverFileList.innerHTML = '';

  if (files.length === 0) {
    serverFileList.innerHTML = '<p style="color:#8b949e; font-size: 0.85rem;">No uploaded files yet.</p>';
    return;
  }

  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <div class="file-info">
        <a href="javascript:void(0)" onclick="downloadStoredFile('${file.id}')">${file.originalName}</a>
      </div>
      <div class="file-actions">
        <button class="delete-btn" onclick="deleteStoredFile('${file.id}')">&times;</button>
      </div>
    `;
    serverFileList.appendChild(item);
  });
}

window.downloadStoredFile = async function(fileId) {
  const fileRecord = await getFileByIdFromDB(fileId);
  if (!fileRecord) {
    alert('File not found');
    return;
  }

  const url = URL.createObjectURL(fileRecord.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileRecord.originalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

window.deleteStoredFile = async function(fileId) {
  if (!confirm('Are you sure you want to delete this file?')) return;
  await deleteFileFromDB(fileId);
  loadFiles();
};