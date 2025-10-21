import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, deleteDoc,
  addDoc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

import { parseExcelFile, getPeriodFromDate } from './excelParser.js';
import { processLeaderboardData, processPersonDetails, processCallSheets } from './dataProcessor.js';
import {
  saveUploadedFile, updateFileStatus, saveSalesData, saveBDCData,
  savePersonDetails, saveCallSheets, getLatestLeaderboards,
  getPersonDetails, getCallSheetsForPerson
} from './database.js';

const firebaseConfig = {
  apiKey: "AIzaSyC74YFnCKeO5TjmPa4H4BMm_pFwohOVAX4",
  authDomain: "store-dashboard-2025.firebaseapp.com",
  projectId: "store-dashboard-2025",
  storageBucket: "store-dashboard-2025.firebasestorage.app",
  messagingSenderId: "556566448299",
  appId: "1:556566448299:web:a2cbe4dda5d21fc6c5cfee",
  measurementId: "G-0D5JMNGE4S"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const secondaryApp = initializeApp(firebaseConfig, 'secondary');
const secondaryAuth = getAuth(secondaryApp);

const SUPERADMIN_EMAIL = 'albertosilvajr0@gmail.com';

window.addEventListener('error', (e) => {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  appEl.innerHTML = `
    <div class="container">
      <div style="padding:50px;text-align:center;color:#dc2626;">
        <h2>Frontend Error</h2>
        <p>${e?.message || 'Unknown error'}</p>
        <pre style="text-align:left;white-space:pre-wrap;background:#fff;border:1px solid #eee;border-radius:8px;padding:12px;">
${(e?.error && e.error.stack) ? e.error.stack : ''}
        </pre>
      </div>
    </div>
  `;
});

function authHeaders() {
  return window.sessionToken ? { Authorization: `Bearer ${window.sessionToken}` } : {};
}

function isAdmin() {
  return window.userData?.role === 'admin' || window.userData?.role === 'superadmin';
}

function isManager() {
  return window.userData?.role === 'manager';
}

function canViewName(targetName) {
  const n = (targetName || '').toUpperCase();
  const mine = (window.userData?.linkedName || '').toUpperCase();
  if (isAdmin() || isManager()) return true;
  return mine && n === mine;
}

function makeSessionToken({ name, role }) {
  const payload = { name, role };
  return btoa(JSON.stringify(payload));
}

function showLoading(on = true) {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  if (on) {
    appEl.innerHTML = `
      <div class="container">
        <div style="background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 8px 18px rgba(0,0,0,.12)">
          <div style="font-size:18px;color:#111827;">Loading…</div>
        </div>
      </div>
    `;
  }
}

function showUserModal() {
  if (!isAdmin()) {
    alert('Only admins can manage users.');
    return;
  }
  document.getElementById('userModal').style.display = 'grid';
  loadUsers();
}

function closeUserModal() {
  document.getElementById('userModal').style.display = 'none';
}

async function login() {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value?.trim();
  const errEl = document.getElementById('error-message');
  if (!email || !password) {
    if (errEl) errEl.textContent = 'Enter email and password.';
    return;
  }
  try {
    showLoading(true);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    if (errEl) errEl.textContent = e.message || 'Login failed';
    showLogin();
  }
}

async function logout() {
  await signOut(auth);
  showLogin();
}

let currentSessionRef = null;
let sessionClosed = false;

function startSession() {
  if (!window.userData?.uid) return;
  const col = collection(db, 'userSessions');
  return addDoc(col, {
    uid: window.userData.uid,
    email: window.userData.email || '',
    linkedName: window.userData.linkedName || '',
    role: window.userData.role || 'user',
    startedAt: serverTimestamp(),
    endedAt: null,
    durationSec: null,
    ua: navigator.userAgent || ''
  }).then(ref => {
    currentSessionRef = ref;
    sessionClosed = false;
  }).catch(() => {});
}

async function endSession() {
  if (!currentSessionRef || sessionClosed) return;
  sessionClosed = true;
  try {
    const end = new Date();
    await updateDoc(currentSessionRef, {
      endedAt: serverTimestamp(),
      endedAtClient: end,
      durationSec: null
    });
  } catch (_) {}
}

window.addEventListener('pagehide', endSession);
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') endSession();
});

onAuthStateChanged(auth, async (user) => {
  // Check if already initialized to prevent duplicate navigation
  if (window.hasInitialized) {
    console.log('Auth state changed but already initialized - skipping navigation');
    // Still update user data if needed
    if (!user) {
      window.userData = null;
    }
    return;
  }

  if (!user) {
    window.userData = null;
    window.hasInitialized = true;
    showLogin();
    return;
  }

  try {
    const userRef = doc(db, 'users', user.uid);
    let snap = await getDoc(userRef);

    if (!snap.exists()) {
      await setDoc(userRef, {
        email: user.email || '',
        role: (user.email === SUPERADMIN_EMAIL) ? 'superadmin' : 'user',
        linkedName: '',
        createdAt: new Date()
      });
      snap = await getDoc(userRef);
    }

    const data = snap.data() || {};
    let role = data.role || 'user';

    if (user.email === SUPERADMIN_EMAIL && role !== 'superadmin') {
      role = 'superadmin';
      await setDoc(userRef, { role }, { merge: true });
    }

    window.userData = {
      email: user.email || '',
      uid: user.uid,
      role,
      linkedName: data.linkedName || ''
    };

    const sessionName = window.userData.linkedName || window.userData.email;
    window.sessionToken = makeSessionToken({ name: sessionName, role });

    try {
      await startSession();
    } catch (_) {}

    // Check if upload/mapping is in progress before showing dashboard
    if (window.uploadInProgress || window.showingMappingUI) {
      console.log('Upload/mapping in progress - skipping dashboard navigation');
      return;
    }

    window.hasInitialized = true;
    showDashboard();
  } catch (err) {
    console.error('Auth init error:', err);
    window.hasInitialized = true;
    showLogin();
  }
});

async function showDashboard() {
  if (window.uploadInProgress || window.showingMappingUI) {
    console.log('Upload/mapping in progress, skipping dashboard redirect');
    return;
  }

  if (!window.userData) {
    showLogin();
    return;
  }

  try {
    showLoading(true);

    const data = await getLatestLeaderboards();
    window.dashboardData = { ok: true, ...data };
    renderDashboard(window.dashboardData);
  } catch (err) {
    console.error('Dashboard error:', err);
    document.getElementById('app').innerHTML = `
      <div class="container">
        <div style="padding: 50px; text-align: center; color: red; background:#fff; border-radius:16px;">
          <h2>Error Loading Dashboard</h2>
          <p style="white-space:pre-wrap;">${err.message}</p>
          <button class="btn" onclick="window.showDashboard()" style="max-width:200px;margin:20px auto;">Retry</button>
          ${isAdmin() ? '<button class="btn" onclick="window.showUploadDialog()" style="max-width:200px;margin:20px auto;background:#10b981;">Upload Excel File</button>' : ''}
        </div>
      </div>
    `;
  } finally {
    showLoading(false);
  }
}

function renderDashboard(data) {
  const salesLB = (data.sales || []);
  const bdcLB = (data.bdc || []).slice(0, 10);

  const me = window.userData || {};

  function rowHTML(person, index, type) {
    const name = person.name || '';
    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
    const allowed = canViewName(name);
    const clickAttr = allowed ? `onclick="window.showPersonDetails('${name.replace(/'/g, "\\'")}', '${type}')"` : '';
    const style = allowed ? '' : 'opacity:0.6; cursor:not-allowed;';

    const right = type === 'Sales'
      ? `${person.sales || 0} Sales • Cr ${person.created || 0} • Sh ${person.shown || 0}`
      : `${person.shows || 0} Shows`;

    return `
      <div class="leaderboard-item" ${clickAttr} style="${style}">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="rank ${rankClass}">${index + 1}</div>
          <div class="name">${name}</div>
        </div>
        <div class="score">${right}</div>
      </div>
    `;
  }

  document.getElementById('app').innerHTML = `
    <div class="header"><h1>Store Performance Dashboard</h1></div>

    <div class="user-info">
      <div>
        Welcome, <strong>${me.email || ''}</strong>
        ${isAdmin() ? '<span style="color:#a7f3d0;"> (Admin)</span>' : (isManager() ? '<span style="color:#93c5fd;"> (Manager)</span>' : '')}
        ${me.linkedName ? ` • Linked: <strong>${me.linkedName}</strong>` : ''}
      </div>
      <div>
        ${isAdmin() ? '<button class="admin-btn" onclick="window.showUserModal()">User Management</button>' : ''}
        ${isAdmin() ? '<button class="admin-btn" onclick="window.showUploadDialog()" style="margin-left:10px;">Upload Excel</button>' : ''}
        <button class="logout-btn" onclick="window.logout()" style="margin-left:10px;">Logout</button>
      </div>
    </div>

    <div class="leaderboard-section" id="content">
      <div class="leaderboard-grid">
        <div class="leaderboard-card">
          <h2>🏆 Sales Leaderboard</h2>
          <div class="leaderboard-list">${salesLB.length ? salesLB.map((p, i) => rowHTML(p, i, 'Sales')).join('') : '<p style="text-align:center;color:#999;">No sales data</p>'}</div>
        </div>
        <div class="leaderboard-card">
          <h2>📞 BDC Leaderboard</h2>
          ${bdcLB.length ? bdcLB.map((p, i) => rowHTML(p, i, 'BDC')).join('') : '<p style="text-align:center;color:#999;">No BDC data</p>'}
        </div>
      </div>
    </div>
  `;
}

async function showPersonDetails(name, type) {
  const contentEl = document.getElementById('content');
  if (contentEl) {
    contentEl.innerHTML = `
      <div class="leaderboard-card" style="padding:24px; text-align:center;">
        Loading ${name}…
      </div>`;
  }

  try {
    const result = await getPersonDetails(name);
    if (!result) throw new Error('Person details not found');

    const payload = result;
    const b = payload.block || {};
    const day = payload.lastDay || {};
    const note = payload.prNotes || {};
    const isSales = (b.type || type) === 'Sales';

    const html = `
      <button onclick="window.showDashboard()" class="btn" style="background:#6B7280;margin-bottom:16px;">← Back to Leaderboard</button>

      <div class="leaderboard-card" style="padding:24px;">
        <h2 style="margin-top:0;">${b.name || name}</h2>
        <div style="color:#6b7280;margin-bottom:12px;">${b.type || type || '-'} • ${b.workingDays || 0} working days (MTD)</div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap:16px;">
          <div><div class="muted">Total Calls (MTD)</div><div style="font-weight:700">${b.callsMTD || 0}</div></div>
          ${isSales ? `
            <div><div class="muted">Sales (MTD)</div><div style="font-weight:700">${b.salesMTD || 0}</div></div>
            <div><div class="muted">Texts (MTD)</div><div style="font-weight:700">${b.textsMTD || 0}</div></div>
          ` : `
            <div><div class="muted">Appts Shown (MTD)</div><div style="font-weight:700">${b.shownMTD || 0}</div></div>
            <div><div class="muted">Appts Created (MTD)</div><div style="font-weight:700">${b.createdMTD || 0}</div></div>
          `}
          <div><div class="muted">Leads In Name (MTD)</div><div style="font-weight:700">${b.leadsInNameMTD || 0}</div></div>
          <div><div class="muted">Avg Talk</div><div style="font-weight:700">${b.avgTalk || '0:00'}</div></div>
        </div>

        <div style="margin-top:18px; background:#f8fafc; border-radius:10px; padding:14px;">
          <div style="font-weight:600; margin-bottom:6px;">Last Work Day</div>
          <div style="display:flex; gap:18px; flex-wrap:wrap;">
            <div><span class="muted">Date:</span> ${day.dateKey || '-'}</div>
            <div><span class="muted">Calls:</span> ${day.calls || 0}</div>
            <div><span class="muted">Avg Talk:</span> ${day.avgTalkMSS || '0:00'}</div>
            ${isSales ? `<div><span class="muted">Sales:</span> ${day.sales ?? 0}</div>` : ''}
          </div>
        </div>

        ${note.wins ? `<div style="margin-top:12px; background:#d9ead3; border-radius:10px; padding:12px;">${note.wins}</div>` : ''}
        ${note.opportunities ? `<div style="margin-top:12px; background:#ffe599; border-radius:10px; padding:12px;">${note.opportunities}</div>` : ''}

        <div style="display:flex; gap:12px; margin-top:20px;">
          <button class="btn" onclick="window.viewCallSheets('${(b.name || name).replace(/'/g, "\\'")}')">📊 View Call Sheets</button>
        </div>
      </div>
    `;

    if (contentEl) contentEl.innerHTML = html;
  } catch (e) {
    if (contentEl) {
      contentEl.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:40px;color:#dc2626; text-align:center;">
          <h2>Error Loading Details</h2>
          <p>${e.message}</p>
        </div>
      `;
    }
  }
}

async function viewCallSheets(name) {
  const contentEl = document.getElementById('content');
  if (contentEl) {
    contentEl.innerHTML = `
      <div class="leaderboard-card" style="padding:24px; text-align:center;">
        Loading call sheets for ${name}…
      </div>`;
  }

  try {
    showLoading?.(true);
    const rows = await getCallSheetsForPerson(name);

    const tzDateOnly = (value) => {
      if (!value) return '-';
      try {
        const d = (value instanceof Date) ? value : new Date(value);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
        return String(value).split('T')[0] || String(value);
      } catch (_) {
        return String(value);
      }
    };

    const yesNoIcon = (flag, lastWorkDay) => {
      return flag
        ? `<span title="Sales rep called on last work day${lastWorkDay ? ' (' + lastWorkDay + ')' : ''}" style="color:#16a34a;font-size:18px;">&#10003;</span>`
        : `<span title="No sales-rep call on last work day${lastWorkDay ? ' (' + lastWorkDay + ')' : ''}" style="color:#dc2626;font-size:18px;">&#10007;</span>`;
    };

    const trs = rows.map(r => {
      const customer = r.link
        ? `<a href="${r.link}" target="_blank" rel="noopener">${r.name || '-'}</a>`
        : (r.name || '-');

      return `
        <tr style="border-top:1px solid #e5e7eb;">
          <td style="padding:10px;width:36px;text-align:center;">
            ${yesNoIcon(!!r.repCalledLastWorkDay, r.lastWorkDay || '')}
          </td>
          <td style="padding:10px;">${customer}</td>
          <td style="padding:10px;">${r.phone || '-'}</td>
          <td style="padding:10px;">${r.email || '-'}</td>
          <td style="padding:10px;">${r.salesPerson || '-'}</td>
          <td style="padding:10px;">${r.bdcAgent || '-'}</td>
          <td style="padding:10px;">${r.source || '-'}</td>
          <td style="padding:10px;">${tzDateOnly(r.dateIn || r.date)}</td>
          <td style="padding:10px;">${r.leadAge ?? '-'}</td>
          <td style="padding:10px;">${r.daysSince ?? '-'}</td>
          <td style="padding:10px;">${r.bucket || '-'}</td>
          <td style="padding:10px;">${r.status || '-'}</td>
          <td style="padding:10px;">${r.reason || '-'}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="leaderboard-card">
        <button onclick="window.showPersonDetails('${name.replace(/'/g, "\\'")}')" class="btn" style="background:#6B7280;margin-bottom:12px;">← Back to ${name}</button>
        <h2 style="margin-top:0;">Call Sheets - ${name}</h2>
        <div style="overflow:auto;">
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="text-align:center; padding:10px; width:36px;" title="Sales rep called on last work day?">✓/✗</th>
                <th style="text-align:left; padding:10px;">Customer</th>
                <th style="text-align:left; padding:10px;">Phone</th>
                <th style="text-align:left; padding:10px;">Email</th>
                <th style="text-align:left; padding:10px;">Sales Person</th>
                <th style="text-align:left; padding:10px;">BDC Agent</th>
                <th style="text-align:left; padding:10px;">Source</th>
                <th style="text-align:left; padding:10px;">Date In</th>
                <th style="text-align:left; padding:10px;">Lead Age (Days)</th>
                <th style="text-align:left; padding:10px;">Days Since Contact</th>
                <th style="text-align:left; padding:10px;">Priority Bucket</th>
                <th style="text-align:left; padding:10px;">Status</th>
                <th style="text-align:left; padding:10px;">Priority Reason</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? trs : `<tr><td colspan="13" style="padding:20px;text-align:center;color:#6b7280;">No call data</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    if (contentEl) contentEl.innerHTML = html;
  } catch (e) {
    if (contentEl) {
      contentEl.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:40px;color:#dc2626; text-align:center;">
          <h2>Error Loading Call Sheets</h2>
          <p>${e.message}</p>
        </div>
      `;
    }
  } finally {
    showLoading?.(false);
  }
}

async function loadUsers() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let html = '';
    usersSnapshot.forEach((docu) => {
      const u = docu.data();
      const email = u.email || '';
      const role = u.role || 'user';
      const linked = u.linkedName || '';
      const isSelf = email === window.userData.email;
      const canDelete = isAdmin() && !isSelf && role !== 'admin' && role !== 'superadmin' && email !== SUPERADMIN_EMAIL;

      html += `
        <div class="user-item">
          <div>
            <div>${email}</div>
            <small>Role: <strong>${role}</strong>${role === 'superadmin' ? ' 👑' : ''} ${linked ? `• Linked: ${linked}` : ''}</small>
          </div>
          ${canDelete ? `<button class="delete-btn" onclick="window.deleteUser('${docu.id}', '${role}', '${email}')">Delete</button>`
            : `<span style="color:#666;">${isSelf ? 'Current User' : (role === 'superadmin' || role === 'admin' ? 'Protected' : '')}</span>`}
        </div>
      `;
    });
    document.getElementById('userListContent').innerHTML = html || '<p>No users found</p>';
  } catch (e) {
    document.getElementById('userListContent').innerHTML = '<p style="color:red;">Failed to load users.</p>';
  }
}

async function addUser() {
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;
  const linkedName = document.getElementById('newUserLinked').value.trim();

  if (!isAdmin()) {
    alert('Only admins can add users.');
    return;
  }
  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }
  if (role === 'superadmin') {
    alert('Superadmin cannot be created here.');
    return;
  }

  try {
    showLoading(true);

    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);

    await setDoc(doc(db, 'users', cred.user.uid), {
      email,
      role,
      linkedName,
      createdAt: new Date(),
      createdBy: window.userData.email
    });

    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserLinked').value = '';
    document.getElementById('newUserRole').value = 'user';

    await signOut(secondaryAuth);

    await loadUsers();
    alert('User added successfully!');
  } catch (error) {
    console.error('Error adding user:', error);
    alert('Error adding user: ' + error.message);
  } finally {
    showLoading(false);
  }
}

async function deleteUser(uid, role, email) {
  if (!isAdmin()) {
    alert('Only admins can delete users.');
    return;
  }
  if (role === 'admin' || role === 'superadmin' || email === SUPERADMIN_EMAIL) {
    alert('Cannot delete admins or the superadmin.');
    return;
  }
  if (!confirm('Are you sure you want to delete this user?')) return;

  try {
    showLoading(true);
    await deleteDoc(doc(db, 'users', uid));
    await loadUsers();
    alert('User deleted successfully!');
  } catch (error) {
    alert('Error deleting user: ' + error.message);
  } finally {
    showLoading(false);
  }
}

function showLogin() {
  const appEl = document.getElementById('app');
  appEl.innerHTML = `
    <div class="login-container">
      <h2>Store Performance Dashboard</h2>
      <div id="error-message" style="color:#dc2626;min-height:20px;margin:10px 0 0;"></div>
      <div class="form-group" style="margin-top:16px;">
        <label for="email">Email</label>
        <input id="email" type="email" placeholder="you@company.com" autocomplete="username" />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input id="password" type="password" placeholder="Your password" autocomplete="current-password" />
      </div>
      <button class="btn" onclick="window.login()">Log in</button>
    </div>
  `;
}

function showUploadDialog() {
  if (!isAdmin()) {
    alert('Only admins can upload files.');
    return;
  }

  const contentEl = document.getElementById('content');
  if (!contentEl) return;

  contentEl.innerHTML = `
    <div class="leaderboard-card" style="padding:24px;">
      <button onclick="window.showDashboard()" class="btn" style="background:#6B7280;margin-bottom:16px;">← Back to Dashboard</button>
      <h2 style="margin-top:0;">Upload Excel File</h2>
      <p style="color:#6b7280;margin-bottom:20px;">Upload your Google Sheets data as an Excel file (.xlsx). The file should contain sheets for Sales, BDC, and Call Sheets data.</p>

      <div class="form-group">
        <input type="file" id="excelFile" accept=".xlsx,.xls" style="padding:12px;border:2px dashed #e5e7eb;border-radius:10px;width:100%;" />
      </div>

      <button class="btn" onclick="window.handleExcelUpload()" style="margin-top:16px;">Upload and Process</button>

      <div id="upload-status" style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:10px;display:none;">
        <div id="upload-message"></div>
      </div>
    </div>
  `;
}

async function handleExcelUpload() {
  console.log('===== UPLOAD STARTED =====');

  // Prevent auto-redirects during upload - SET BOTH FLAGS FIRST!
  window.uploadInProgress = true;
  window.showingMappingUI = true;
  console.log('uploadInProgress set to:', window.uploadInProgress);
  console.log('showingMappingUI set to:', window.showingMappingUI);

  const fileInput = document.getElementById('excelFile');
  const statusEl = document.getElementById('upload-status');
  const messageEl = document.getElementById('upload-message');

  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Please select a file first');
    window.uploadInProgress = false;
    window.showingMappingUI = false;
    return;
  }

  const file = fileInput.files[0];
  console.log('File selected:', file.name, 'Size:', file.size);

  try {
    statusEl.style.display = 'block';
    messageEl.innerHTML = '<div style="color:#2563eb;">📤 Reading file...</div>';

    console.log('Calling parseExcelFile...');
    const { sheets } = await parseExcelFile(file);
    console.log('File parsed successfully! Sheets:', Object.keys(sheets));

    // Store for column mapping
    window.uploadedSheets = sheets;
    window.uploadedFileName = file.name;
    window.uploadedFileSize = file.size;

    console.log('About to call showColumnMapping...');
    // Show column mapping interface (keep uploadInProgress = true)
    showColumnMapping(sheets);
    console.log('showColumnMapping called, uploadInProgress is:', window.uploadInProgress);

  } catch (error) {
    window.uploadInProgress = false;
    window.showingMappingUI = false;
    window.lastUploadError = error;
    console.error('PARSE ERROR:', error);
    console.error('Error stack:', error.stack);

    // Show persistent full-page error
    const contentEl = document.getElementById('content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="leaderboard-card" style="padding:24px;max-width:900px;margin:20px auto;background:#fee2e2;border:3px solid #dc2626;">
          <h2 style="color:#dc2626;margin-top:0;">❌ File Parse Failed</h2>
          <div style="background:white;padding:16px;border-radius:8px;margin:16px 0;">
            <strong>Error Message:</strong><br>
            <code style="color:#dc2626;">${error.message || 'Unknown error occurred'}</code>
          </div>
          <details open style="background:white;padding:16px;border-radius:8px;margin:16px 0;">
            <summary style="cursor:pointer;font-weight:600;margin-bottom:12px;color:#374151;">📋 Full Stack Trace</summary>
            <pre style="font-size:11px;overflow:auto;max-height:500px;white-space:pre-wrap;color:#1f2937;">${error.stack || 'No stack trace available'}</pre>
          </details>
          <div style="margin-top:20px;">
            <button class="btn" onclick="window.showUploadDialog()" style="background:#2563eb;">Try Again</button>
            <button class="btn" onclick="window.uploadInProgress = false; window.showDashboard()" style="background:#6B7280;margin-left:12px;">Back to Dashboard</button>
          </div>
        </div>
      `;
    }
  }
}

async function processUploadWithMapping() {
  const statusEl = document.getElementById('mapping-status');
  const messageEl = document.getElementById('mapping-message');

  window.uploadInProgress = true;

  try {
    statusEl.style.display = 'block';
    const sheets = window.uploadedSheets;

    messageEl.innerHTML = '<div style="color:#2563eb;">💾 Saving to database...</div>';

    console.log('Saving uploaded file record...');
    const uploadedFile = await saveUploadedFile(window.uploadedFileName, window.userData.email, window.uploadedFileSize);
    console.log('File record saved:', uploadedFile);

    if (!uploadedFile || !uploadedFile.id) {
      throw new Error('Failed to save file record to database');
    }

    const fileId = uploadedFile.id;

    console.log('Processing leaderboard data...');
    const { sales, bdc } = processLeaderboardData(sheets);
    console.log('Processed:', sales.length, 'sales,', bdc.length, 'bdc');

    const period = getPeriodFromDate();

    messageEl.innerHTML = '<div style="color:#2563eb;">💾 Saving sales data...</div>';
    console.log('Saving sales data...');
    await saveSalesData(fileId, sales, period);
    console.log('Sales data saved');

    messageEl.innerHTML = '<div style="color:#2563eb;">💾 Saving BDC data...</div>';
    console.log('Saving BDC data...');
    await saveBDCData(fileId, bdc, period);
    console.log('BDC data saved');

    const allPeople = [...new Set([...sales.map(s => s.name), ...bdc.map(b => b.name)])];
    console.log('Processing details for', allPeople.length, 'people');

    let processedPeople = 0;
    for (const personName of allPeople) {
      messageEl.innerHTML = `<div style="color:#2563eb;">💾 Processing ${personName} (${processedPeople + 1}/${allPeople.length})...</div>`;

      console.log('Processing person:', personName);
      const details = processPersonDetails(sheets, personName);
      await savePersonDetails(fileId, details, period);

      const calls = processCallSheets(sheets, personName);
      if (calls.length > 0) {
        console.log('Saving', calls.length, 'calls for', personName);
        await saveCallSheets(fileId, calls, personName, period);
      }

      processedPeople++;
    }

    console.log('Updating file status to completed...');
    await updateFileStatus(fileId, 'completed');
    console.log('Upload complete!');

    window.uploadInProgress = false;

    messageEl.innerHTML = `
      <div style="color:#16a34a;font-weight:600;">✅ Upload Complete!</div>
      <div style="margin-top:8px;color:#6b7280;">Processed ${sales.length} sales records, ${bdc.length} BDC records, and ${allPeople.length} people.</div>
      <button class="btn" onclick="window.showDashboard()" style="margin-top:16px;">View Dashboard</button>
    `;

  } catch (error) {
    window.uploadInProgress = false;
    window.lastUploadError = error;
    console.error('PROCESSING ERROR:', error);
    console.error('Error stack:', error.stack);

    // Show persistent full-page error
    const contentEl = document.getElementById('content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="leaderboard-card" style="padding:24px;max-width:900px;margin:20px auto;background:#fee2e2;border:3px solid #dc2626;">
          <h2 style="color:#dc2626;margin-top:0;">❌ Processing Failed</h2>
          <div style="background:white;padding:16px;border-radius:8px;margin:16px 0;">
            <strong>Error Message:</strong><br>
            <code style="color:#dc2626;">${error.message || 'Unknown error occurred'}</code>
          </div>
          <details open style="background:white;padding:16px;border-radius:8px;margin:16px 0;">
            <summary style="cursor:pointer;font-weight:600;margin-bottom:12px;color:#374151;">📋 Full Stack Trace</summary>
            <pre style="font-size:11px;overflow:auto;max-height:500px;white-space:pre-wrap;color:#1f2937;">${error.stack || 'No stack trace available'}</pre>
          </details>
          <div style="margin-top:20px;">
            <button class="btn" onclick="window.showUploadDialog()" style="background:#2563eb;">Try Again</button>
            <button class="btn" onclick="window.uploadInProgress = false; window.showDashboard()" style="background:#6B7280;margin-left:12px;">Back to Dashboard</button>
          </div>
        </div>
      `;
    }
  }
}

function showColumnMapping(sheets) {
  console.log('showColumnMapping called with', Object.keys(sheets).length, 'sheets');

  // Already set in handleExcelUpload, but ensure it's still true
  window.showingMappingUI = true;
  console.log('showingMappingUI confirmed:', window.showingMappingUI);

  const contentEl = document.getElementById('content');
  if (!contentEl) {
    console.error('Content element not found!');
    return;
  }

  const sheetNames = Object.keys(sheets);

  // Get sample columns from first sheet with data
  const sampleColumns = {};
  for (const sheetName of sheetNames) {
    if (sheets[sheetName].length > 0) {
      sampleColumns[sheetName] = Object.keys(sheets[sheetName][0]);
    }
  }

  console.log('Sheet details:');
  sheetNames.forEach(name => {
    console.log(`  ${name}: ${sheets[name].length} rows`);
    if (sheets[name].length > 0) {
      console.log(`    Columns:`, Object.keys(sheets[name][0]));
      console.log(`    Sample row:`, sheets[name][0]);
    }
  });

  // Build detailed sheet info with columns
  let sheetDetailsHTML = '';
  sheetNames.forEach(name => {
    const rowCount = sheets[name].length;
    if (rowCount > 0) {
      const cols = Object.keys(sheets[name][0]).join(', ');
      sheetDetailsHTML += `<div style="margin-bottom:12px;padding:8px;background:white;border-radius:4px;">
        <strong style="color:#374151;">${name}</strong> (${rowCount} rows)<br>
        <span style="font-size:12px;color:#6b7280;">Columns: ${cols}</span>
      </div>`;
    } else {
      sheetDetailsHTML += `<div style="margin-bottom:12px;padding:8px;background:white;border-radius:4px;">
        <strong style="color:#374151;">${name}</strong> (${rowCount} rows) - No data
      </div>`;
    }
  });

  contentEl.innerHTML = `
    <div class="leaderboard-card" style="padding:24px;max-width:1000px;margin:0 auto;">
      <h2 style="margin-top:0;">Map Excel Columns</h2>
      <p style="color:#6b7280;margin-bottom:16px;">Found ${sheetNames.length} sheets. Please map each sheet to the correct data type:</p>

      <details style="margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:8px;">
        <summary style="cursor:pointer;font-weight:600;color:#374151;padding:4px;">📊 View All Sheets and Columns</summary>
        <div style="margin-top:12px;">${sheetDetailsHTML}</div>
      </details>

      <div style="background:#f8fafc;padding:20px;border-radius:10px;margin-bottom:24px;">
        <h3 style="margin-top:0;font-size:16px;">Sheet Mapping</h3>
        <div style="display:grid;gap:16px;">
          <div class="form-group">
            <label>Sales Data Sheet:</label>
            <select id="map-sales-sheet" class="form-control">
              <option value="">-- Select Sheet --</option>
              ${sheetNames.map(name => `<option value="${name}" ${name === 'BDC Sales' ? 'selected' : ''}>${name} (${sheets[name].length} rows)</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>BDC Agent Data Sheet:</label>
            <select id="map-bdc-sheet" class="form-control">
              <option value="">-- Select Sheet --</option>
              ${sheetNames.map(name => `<option value="${name}" ${name === 'BDC_Agent_Tracking' ? 'selected' : ''}>${name} (${sheets[name].length} rows)</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Appointment Activity Sheet:</label>
            <select id="map-appt-sheet" class="form-control">
              <option value="">-- Select Sheet --</option>
              ${sheetNames.map(name => `<option value="${name}" ${name === 'Appt Act' ? 'selected' : ''}>${name} (${sheets[name].length} rows)</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>User/Person Details Sheet:</label>
            <select id="map-details-sheet" class="form-control">
              <option value="">-- Select Sheet --</option>
              ${sheetNames.map(name => `<option value="${name}" ${name === 'User Act' ? 'selected' : ''}>${name} (${sheets[name].length} rows)</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Call Sheets Data:</label>
            <select id="map-calls-sheet" class="form-control">
              <option value="">-- Select Sheet --</option>
              ${sheetNames.map(name => `<option value="${name}" ${name === 'Calls' ? 'selected' : ''}>${name} (${sheets[name].length} rows)</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:12px;">
        <button class="btn" onclick="window.confirmMapping()" style="flex:1;">Continue with Mapping</button>
        <button class="btn" onclick="window.uploadInProgress = false; window.showingMappingUI = false; window.showUploadDialog()" style="background:#6B7280;">Cancel</button>
      </div>

      <div id="mapping-status" style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:10px;display:none;">
        <div id="mapping-message"></div>
      </div>
    </div>
  `;
}

function confirmMapping() {
  const mapping = {
    sales: document.getElementById('map-sales-sheet').value,
    bdc: document.getElementById('map-bdc-sheet').value,
    appt: document.getElementById('map-appt-sheet').value,
    details: document.getElementById('map-details-sheet').value,
    calls: document.getElementById('map-calls-sheet').value
  };

  if (!mapping.sales || !mapping.bdc || !mapping.appt) {
    alert('Please select sheets for Sales, BDC, and Appointment data at minimum.');
    return;
  }

  // Clear the mapping UI flag before processing
  window.showingMappingUI = false;

  // Store mapping
  window.sheetMapping = mapping;
  console.log('Sheet mapping confirmed:', mapping);

  // Process upload with mapping
  processUploadWithMapping();
}

window.login = login;
window.logout = logout;
window.showUserModal = showUserModal;
window.closeUserModal = closeUserModal;
window.addUser = addUser;
window.deleteUser = deleteUser;
window.showPersonDetails = showPersonDetails;
window.viewCallSheets = viewCallSheets;
window.showDashboard = showDashboard;
window.showUploadDialog = showUploadDialog;
window.handleExcelUpload = handleExcelUpload;
window.showColumnMapping = showColumnMapping;
window.confirmMapping = confirmMapping;
window.processUploadWithMapping = processUploadWithMapping;

// Initialize upload flags BEFORE auth listener
window.uploadInProgress = false;
window.hasInitialized = false;
window.showingMappingUI = false;
