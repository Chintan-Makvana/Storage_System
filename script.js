// Inside script.js
const BACKEND_URL = 'https://happy-cats-smile.loca.lt/upload';

// Auth State & Elements
let isRegisterMode = false;
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
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const endpoint = isRegisterMode ? '/api/register' : '/api/login';

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (res.ok) {
      alert(data.message || (isRegisterMode ? 'Registered!' : 'Logged in!'));
      checkSession();
    } else {
      alert(data.message || 'Authentication failed.');
    }
  } catch (err) {
    console.error('Auth Error:', err);
    alert('Cannot reach the server. Make sure node server.js is running on port 3000!');
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch(`${API_URL}/api/logout`, { method: 'POST', credentials: 'include' });
  checkSession();
});

// Check Session on Load
async function checkSession() {
  try {
    const res = await fetch(`${API_URL}/api/user`, { credentials: 'include' });
    if (res.ok) {
      const user = await res.json();
      authContainer.style.display = 'none';
      driveContainer.style.display = 'flex';
      userDisplay.textContent = user.email;
      loadServerFiles();
    } else {
      authContainer.style.display = 'block';
      driveContainer.style.display = 'none';
    }
  } catch (err) {
    authContainer.style.display = 'block';
    driveContainer.style.display = 'none';
  }
}
checkSession();

// --- Local File Staging (Pre-Upload) ---

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

function removeStagedFile(index) {
  selectedFiles.splice(index, 1);
  renderStagedFiles();
}

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

// Upload Files to Express Server
uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  const formData = new FormData();
  selectedFiles.forEach(file => formData.append('files', file));

  try {
    const res = await fetch(`${API_URL}/upload`, { 
      method: 'POST', 
      credentials: 'include',
      body: formData 
    });

    if (res.ok) {
      selectedFiles = [];
      renderStagedFiles();
      loadServerFiles();
    } else {
      alert('Upload failed.');
    }
  } catch (err) {
    alert('Failed to connect to server during upload.');
  }
});

// --- Server-Side Uploaded Files Management ---

async function loadServerFiles() {
  const res = await fetch(`${API_URL}/api/files`, { credentials: 'include' });
  if (!res.ok) return;

  const files = await res.json();
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
        <a href="${API_URL}/files/${file.id}" target="_blank">${file.originalName}</a>
      </div>
      <div class="file-actions">
        <button class="delete-btn" onclick="deleteServerFile('${file.id}')">&times;</button>
      </div>
    `;
    serverFileList.appendChild(item);
  });
}

async function deleteServerFile(fileId) {
  if (!confirm('Are you sure you want to delete this file?')) return;

  const res = await fetch(`${API_URL}/api/files/${fileId}`, { 
    method: 'DELETE',
    credentials: 'include' 
  });
  
  if (res.ok) {
    loadServerFiles();
  } else {
    alert('Failed to delete file.');
  }
}