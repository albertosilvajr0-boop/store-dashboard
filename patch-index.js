#!/usr/bin/env node
/**
 * patch-index.js
 * 
 * Run this in the same directory as your index.html:
 *   node patch-index.js
 * 
 * It makes three surgical replacements to enable Firestore-first loading.
 * A backup (index.html.bak) is created before any changes.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'index.html');

if (!fs.existsSync(FILE)) {
  console.error('❌ index.html not found in current directory');
  process.exit(1);
}

// Backup
fs.copyFileSync(FILE, FILE + '.bak');
console.log('✅ Backup created: index.html.bak');

let html = fs.readFileSync(FILE, 'utf8');
let changes = 0;

// ═══════════════════════════════════════════
// PATCH 1: Replace fetchPerson()
// ═══════════════════════════════════════════

const oldFetchPerson = `async function fetchPerson(name) {
  const key = cacheKey(name);
  if (personCache.has(key)) return personCache.get(key);
  const url =
  \`\${SCRIPT_URL}?route=person&name=\${encodeURIComponent(name)}&session=\${encodeURIComponent(window.sessionToken || '')}\`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data?.ok) personCache.set(key, data);
  return data;
}`;

// Try alternate formatting (single line url)
const oldFetchPerson2 = `async function fetchPerson(name) {
  const key = cacheKey(name);
  if (personCache.has(key)) return personCache.get(key);
  const url = \`\${SCRIPT_URL}?route=person&name=\${encodeURIComponent(name)}&session=\${encodeURIComponent(window.sessionToken || '')}\`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data?.ok) personCache.set(key, data);
  return data;
}`;

const newFetchPerson = `const PERSON_SNAPSHOT_MAX_AGE_MS = 20 * 60 * 1000;

async function fetchPerson(name) {
  const key = cacheKey(name);
  if (personCache.has(key)) return personCache.get(key);

  // Try Firestore first (instant)
  try {
    const snapDoc = await getDoc(doc(db, 'personSnapshots', name.toUpperCase()));
    if (snapDoc.exists()) {
      const raw = snapDoc.data();
      const updatedAt = raw.updatedAt?.toDate?.() || new Date(raw.updatedAt);
      const ageMs = Date.now() - updatedAt.getTime();
      if (ageMs < PERSON_SNAPSHOT_MAX_AGE_MS) {
        const payload = JSON.parse(raw.jsonData);
        const result = { ok: true, data: payload, _source: 'firestore' };
        personCache.set(key, result);
        console.log(\`[Firestore] \${name} loaded (age: \${Math.round(ageMs/1000)}s)\`);
        return result;
      }
    }
  } catch (fsErr) {
    console.warn('[Firestore] Person read failed, falling back to GAS:', fsErr.message);
  }

  // Fallback: GAS backend
  const url = \`\${SCRIPT_URL}?route=person&name=\${encodeURIComponent(name)}&session=\${encodeURIComponent(window.sessionToken || '')}\`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data?.ok) personCache.set(key, data);
  return data;
}`;

if (html.includes(oldFetchPerson)) {
  html = html.replace(oldFetchPerson, newFetchPerson);
  changes++;
  console.log('✅ Patch 1: fetchPerson() replaced (multi-line URL variant)');
} else if (html.includes(oldFetchPerson2)) {
  html = html.replace(oldFetchPerson2, newFetchPerson);
  changes++;
  console.log('✅ Patch 1: fetchPerson() replaced (single-line URL variant)');
} else {
  // Regex fallback
  const re = /async function fetchPerson\(name\)\s*\{[^}]*personCache\.has\(key\)[^}]*route=person[^}]*personCache\.set\(key, data\);?\s*return data;\s*\}/s;
  if (re.test(html)) {
    html = html.replace(re, newFetchPerson);
    changes++;
    console.log('✅ Patch 1: fetchPerson() replaced (regex fallback)');
  } else {
    console.error('❌ Patch 1 FAILED: Could not find fetchPerson() — apply manually');
  }
}

// ═══════════════════════════════════════════
// PATCH 2: Replace prefetchForDashboard()
// ═══════════════════════════════════════════

const oldPrefetch = `function prefetchForDashboard(data) {
  const topSales = (data.sales || []).slice(0, 3).map(x => x.name);
  const topBDC = (data.bdc || []).slice(0, 3).map(x => x.name);
  const mine = window.userData?.linkedName ? [window.userData.linkedName] : [];
  [...new Set([...topSales, ...topBDC, ...mine])].forEach(prefetchPerson);
}`;

const newPrefetch = `function prefetchForDashboard(data) {
  const allSales = (data.sales || []).map(x => x.name);
  const allBDC = (data.bdc || []).map(x => x.name);
  const mine = window.userData?.linkedName ? [window.userData.linkedName] : [];
  [...new Set([...allSales, ...allBDC, ...mine])].forEach(prefetchPerson);
}`;

if (html.includes(oldPrefetch)) {
  html = html.replace(oldPrefetch, newPrefetch);
  changes++;
  console.log('✅ Patch 2: prefetchForDashboard() replaced');
} else {
  // Regex fallback
  const re2 = /function prefetchForDashboard\(data\)\s*\{[^}]*slice\(0,\s*3\)[^}]*prefetchPerson[^}]*\}/s;
  if (re2.test(html)) {
    html = html.replace(re2, newPrefetch);
    changes++;
    console.log('✅ Patch 2: prefetchForDashboard() replaced (regex fallback)');
  } else {
    console.error('❌ Patch 2 FAILED: Could not find prefetchForDashboard() — apply manually');
  }
}

// ═══════════════════════════════════════════
// PATCH 3: Replace showDashboard() fetch portion
// ═══════════════════════════════════════════

// We look for the GAS fetch block inside showDashboard and wrap it with Firestore-first logic
const oldDashFetch = `const url = \`\${SCRIPT_URL}?route=leaderboards&session=\${encodeURIComponent(window.sessionToken || '')}\`;
    const resp = await fetch(url);
    const raw = await resp.text();
    let result;
    try { result = JSON.parse(raw); } catch { throw new Error(\`Non-JSON response.\\nHTTP \${resp.status}\\n\\n\${raw}\`); }
    if (!result.ok) throw new Error(result.error || 'Backend returned ok:false');

    const payload = (result.data) ? result.data : result;`;

const newDashFetch = `let payload = null;

    // Try Firestore first (instant)
    try {
      const lbDoc = await getDoc(doc(db, 'dashboardSnapshots', 'leaderboards'));
      if (lbDoc.exists()) {
        const fsRaw = lbDoc.data();
        const updatedAt = fsRaw.updatedAt?.toDate?.() || new Date(fsRaw.updatedAt);
        const ageMs = Date.now() - updatedAt.getTime();
        if (ageMs < 20 * 60 * 1000) {
          payload = JSON.parse(fsRaw.jsonData);
          console.log(\`[Firestore] Leaderboards loaded (age: \${Math.round(ageMs/1000)}s)\`);
        }
      }
    } catch (fsErr) {
      console.warn('[Firestore] Leaderboard read failed:', fsErr.message);
    }

    // Fallback: GAS backend
    if (!payload) {
      const url = \`\${SCRIPT_URL}?route=leaderboards&session=\${encodeURIComponent(window.sessionToken || '')}\`;
      const resp = await fetch(url);
      const raw = await resp.text();
      let result;
      try { result = JSON.parse(raw); } catch { throw new Error(\`Non-JSON response.\\nHTTP \${resp.status}\\n\\n\${raw}\`); }
      if (!result.ok) throw new Error(result.error || 'Backend returned ok:false');
      payload = (result.data) ? result.data : result;
    }`;

if (html.includes(oldDashFetch)) {
  html = html.replace(oldDashFetch, newDashFetch);
  changes++;
  console.log('✅ Patch 3: showDashboard() fetch block replaced');
} else {
  // Try with slightly different whitespace
  const re3 = /const url = `\$\{SCRIPT_URL\}\?route=leaderboards[^`]*`;\s*const resp = await fetch\(url\);\s*const raw = await resp\.text\(\);\s*let result;\s*try \{ result = JSON\.parse\(raw\);[^;]*;\s*if \(!result\.ok\)[^;]*;\s*const payload = \(result\.data\) \? result\.data : result;/s;
  if (re3.test(html)) {
    html = html.replace(re3, newDashFetch);
    changes++;
    console.log('✅ Patch 3: showDashboard() fetch block replaced (regex fallback)');
  } else {
    console.error('❌ Patch 3 FAILED: Could not find showDashboard() fetch block — apply manually');
  }
}

// Write result
fs.writeFileSync(FILE, html, 'utf8');
console.log(`\n🎉 Done! ${changes}/3 patches applied. ${changes < 3 ? 'Check errors above for manual fixes.' : 'All patches successful!'}`);
console.log('   Commit and push to deploy via GitHub Actions.');
