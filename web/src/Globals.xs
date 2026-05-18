function readToken() {
  try { return window.localStorage.getItem('tt_token') || null; } catch (e) { return null; }
}

function writeToken(token) {
  try {
    if (token) window.localStorage.setItem('tt_token', token);
    else window.localStorage.removeItem('tt_token');
  } catch (e) {}
}

function readSession() {
  try {
    const raw = window.localStorage.getItem('tt_session');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writeSession(session) {
  try {
    if (session) window.localStorage.setItem('tt_session', JSON.stringify(session));
    else window.localStorage.removeItem('tt_session');
  } catch (e) {}
}

function authHeaders(token) {
  return token ? { Authorization: 'Bearer ' + token } : {};
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function toIsoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function combineDateTime(dateStr, timeStr) {
  const t = (timeStr || '').length === 5 ? (timeStr + ':00') : timeStr;
  return new Date(dateStr + 'T' + t + 'Z').toISOString();
}

function entryToFormData(e) {
  return {
    description: e.description,
    projectId: e.projectId,
    date: e.startTime.slice(0, 10),
    startTime: e.startTime.slice(11, 16),
    endTime: e.endTime.slice(11, 16)
  };
}

function durationSeconds(startIso, endIso) {
  return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h + 'h ' + (m < 10 ? '0' + m : m) + 'm';
}

function projectName(projectId, projectsList) {
  if (!projectId) return '(no project)';
  const p = projectsList.find(p => p.id === projectId);
  return p ? p.name : '(unknown)';
}

function projectColor(projectId, projectsList) {
  // Fallback color when a time entry has no project or the project was
  // deleted. Surface-300 from the Animo palette keeps the bullet visible
  // without competing with real project colors.
  if (!projectId) return '#C2BDB7';
  const p = projectsList.find(p => p.id === projectId);
  return p ? p.color : '#C2BDB7';
}

function mondayOfWeek(d) {
  const date = new Date(d);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function shiftDate(iso, days) {
  const date = new Date(iso + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatMonthDay(iso) {
  if (!iso) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(iso + 'T00:00:00Z');
  return months[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

function projectsForPicker(projects, clients, search) {
  const cmap = {};
  for (const c of (clients || [])) cmap[c.id] = c.name;
  let result = (projects || []).map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    clientId: p.clientId,
    clientName: p.clientId ? (cmap[p.clientId] || 'Unknown') : 'No client'
  }));
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(p =>
      p.name.toLowerCase().includes(s) ||
      p.clientName.toLowerCase().includes(s)
    );
  }
  return result;
}

function getDaysOfWeek(weekStartIso) {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date().toISOString().slice(0, 10);
  const result = [];
  for (let i = 0; i < 7; i++) {
    const date = shiftDate(weekStartIso, i);
    result.push({
      date,
      label: labels[i] + ' ' + date.slice(8, 10),
      isToday: date === today
    });
  }
  return result;
}

function dayTotalSeconds(entriesList, dayIso) {
  return entriesList
    .filter(e => e.startTime.slice(0, 10) === dayIso)
    .reduce((s, e) => s + durationSeconds(e.startTime, e.endTime), 0);
}

function weekTotalSeconds(entriesList, weekStartIso) {
  const weekEnd = shiftDate(weekStartIso, 7);
  return entriesList
    .filter(e => {
      const d = e.startTime.slice(0, 10);
      return d >= weekStartIso && d < weekEnd;
    })
    .reduce((s, e) => s + durationSeconds(e.startTime, e.endTime), 0);
}

function getDailyTotals(entriesList, fromIso, toIso) {
  const result = [];
  let cursor = fromIso;
  while (cursor <= toIso) {
    const seconds = entriesList
      .filter(e => e.startTime.slice(0, 10) === cursor)
      .reduce((s, e) => s + durationSeconds(e.startTime, e.endTime), 0);
    result.push({ day: cursor.slice(5), hours: Math.round((seconds / 3600) * 100) / 100 });
    cursor = shiftDate(cursor, 1);
  }
  return result;
}

function rangeFilterEntries(entriesList, fromIso, toIso) {
  return entriesList.filter(e => {
    const d = e.startTime.slice(0, 10);
    return d >= fromIso && d <= toIso;
  });
}

function rangeTotalSeconds(entriesList, fromIso, toIso) {
  return rangeFilterEntries(entriesList, fromIso, toIso)
    .reduce((s, e) => s + durationSeconds(e.startTime, e.endTime), 0);
}

function rangeAverageSeconds(entriesList, fromIso, toIso) {
  const total = rangeTotalSeconds(entriesList, fromIso, toIso);
  const days = Math.max(1, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000) + 1);
  return Math.round(total / days);
}

function rangeAverageSecondsFromDaily(daily) {
  if (!daily || !daily.length) return 0;
  const total = daily.reduce((s, d) => s + (d.seconds || 0), 0);
  return Math.round(total / daily.length);
}

function groupEntriesByDay(entriesList) {
  const groups = {};
  for (const e of entriesList || []) {
    const day = e.startTime.slice(0, 10);
    if (!groups[day]) groups[day] = { date: day, entries: [], totalSec: 0 };
    groups[day].entries.push(e);
    groups[day].totalSec += durationSeconds(e.startTime, e.endTime);
  }
  return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
}

function parseTimeToSec(hhmm) {
  if (!hhmm) return 0;
  const parts = String(hhmm).split(':');
  const h = parseInt(parts[0] || '0', 10) || 0;
  const m = parseInt(parts[1] || '0', 10) || 0;
  const s = parseInt(parts[2] || '0', 10) || 0;
  return h * 3600 + m * 60 + s;
}

function addSecToTime(hhmm, seconds) {
  let total = parseTimeToSec(hhmm) + seconds;
  if (total < 0) total = 0;
  if (total >= 86400) total = 86340;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function formatHms(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function parseHmsToSec(str) {
  if (!str) return 0;
  const parts = String(str).split(':').map(p => parseInt(p, 10) || 0);
  if (parts.length === 1) return parts[0] * 3600;
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function toggleTagId(tagIds, id) {
  const arr = tagIds || [];
  if (arr.indexOf(id) >= 0) return arr.filter(x => x !== id);
  return arr.concat([id]);
}

function tagsForPicker(tags, search) {
  let result = (tags || []).map(t => ({ id: t.id, name: t.name, color: t.color }));
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(t => (t.name || '').toLowerCase().indexOf(s) !== -1);
  }
  return result;
}

function publishResume(description, projectId) {
  try {
    if (window.ttPublishResume) {
      window.ttPublishResume(description || '', projectId || null);
    }
  } catch (e) {}
}

function applyReportFilters(entries, projectIds, tagIds) {
  const list = entries || [];
  const pids = Array.isArray(projectIds) ? projectIds : (projectIds ? [projectIds] : []);
  const tids = Array.isArray(tagIds) ? tagIds : (tagIds ? [tagIds] : []);
  return list.filter(e => {
    if (pids.length > 0 && pids.indexOf(e.projectId) === -1) return false;
    if (tids.length > 0) {
      const ids = e.tagIds || [];
      // OR-semantics: keep the entry when it matches any of the chosen tags.
      if (!tids.some(t => ids.indexOf(t) !== -1)) return false;
    }
    return true;
  });
}

function projectOptionsGroupedByClient(projects, clients) {
  const clientMap = {};
  for (const c of (clients || [])) clientMap[c.id] = c;
  const NO_CLIENT = 'No client';
  const list = (projects || []).map(p => {
    const cName = p.clientId && clientMap[p.clientId] ? clientMap[p.clientId].name : NO_CLIENT;
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      clientId: p.clientId,
      clientName: cName,
      keywords: [cName, p.name],
    };
  });
  list.sort((a, b) => {
    if (a.clientName === b.clientName) return a.name.localeCompare(b.name);
    if (a.clientName === NO_CLIENT) return 1;
    if (b.clientName === NO_CLIENT) return -1;
    return a.clientName.localeCompare(b.clientName);
  });
  return list;
}

function sumDurationSeconds(entries) {
  return (entries || []).reduce((s, e) => s + (e.durationSeconds || 0), 0);
}

function sumBillableSeconds(entries) {
  return (entries || []).filter(e => e.billable).reduce((s, e) => s + (e.durationSeconds || 0), 0);
}

function dailyTotalsFromEntries(entries, fromIso, toIso) {
  const out = [];
  let cursor = fromIso;
  while (cursor <= toIso) {
    const seconds = (entries || [])
      .filter(e => (e.startTime || '').slice(0, 10) === cursor)
      .reduce((s, e) => s + (e.durationSeconds || 0), 0);
    out.push({ date: cursor, seconds });
    cursor = shiftDate(cursor, 1);
  }
  return out;
}

function amountsFromEntries(entries) {
  const map = {};
  for (const e of (entries || [])) {
    if (!e.billable) continue;
    const rate = e.hourlyRate || 0;
    if (rate <= 0) continue;
    const cur = e.currency || 'EUR';
    map[cur] = (map[cur] || 0) + (e.durationSeconds / 3600) * rate;
  }
  const keys = Object.keys(map).sort();
  const out = [];
  for (const cur of keys) {
    out.push({ currency: cur, amount: Math.round(map[cur] * 100) / 100 });
  }
  return out;
}

function projectsForClient(projects, clientId) {
  const list = projects || [];
  if (!clientId) return list;
  return list.filter(p => p.clientId === clientId);
}

function tagsForIds(tagIds, allTags) {
  const ids = tagIds || [];
  const map = {};
  for (const t of (allTags || [])) map[t.id] = t;
  return ids.map(id => map[id]).filter(t => t);
}

function tagNamesForIds(tagIds, allTags) {
  return tagsForIds(tagIds, allTags).map(t => t.name);
}

function entryMatchesTagFilter(entry, tagFilterIds) {
  if (!tagFilterIds || tagFilterIds.length === 0) return true;
  const ids = entry.tagIds || [];
  for (const fid of tagFilterIds) {
    if (ids.indexOf(fid) === -1) return false;
  }
  return true;
}

function entryMatchesSearch(entry, query, projects, clients, tags) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  if ((entry.description || '').toLowerCase().indexOf(q) !== -1) return true;
  if (entry.projectId) {
    const p = (projects || []).find(pp => pp.id === entry.projectId);
    if (p) {
      if ((p.name || '').toLowerCase().indexOf(q) !== -1) return true;
      if (p.clientId) {
        const c = (clients || []).find(cc => cc.id === p.clientId);
        if (c && (c.name || '').toLowerCase().indexOf(q) !== -1) return true;
      }
    }
  }
  const tagNames = tagNamesForIds(entry.tagIds, tags);
  for (const tn of tagNames) {
    if ((tn || '').toLowerCase().indexOf(q) !== -1) return true;
  }
  return false;
}

function filterEntries(entries, query, tagFilterIds, projects, clients, tags) {
  const list = entries || [];
  return list.filter(e =>
    entryMatchesSearch(e, query, projects, clients, tags) &&
    entryMatchesTagFilter(e, tagFilterIds)
  );
}

function duplicateEntryPayload(entry, targetDate) {
  const date = targetDate || toIsoDate(new Date());
  const start = entry.startTime ? entry.startTime.slice(11, 16) : '09:00';
  const end = entry.endTime ? entry.endTime.slice(11, 16) : '10:00';
  return {
    projectId: entry.projectId || null,
    description: entry.description || '',
    startTime: combineDateTime(date, start),
    endTime: combineDateTime(date, end)
  };
}
