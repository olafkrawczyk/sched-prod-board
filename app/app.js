import { fetchIncidents, ack } from './api.js';

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');

const ackedIds = new Set();
const pendingIds = new Set();
let currentIncidents = [];
let inFlight = false;

const timeFormatter = new Intl.DateTimeFormat(navigator.language || undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatLocalTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return escapeHtml(iso);
  return timeFormatter.format(date);
}

function render(incidents) {
  currentIncidents = incidents;

  if (loader && loader.isConnected) {
    loader.remove();
  }

  if (incidents.length === 0) {
    empty.hidden = false;
    list.hidden = true;
    list.innerHTML = '';
    return;
  }

  empty.hidden = true;
  list.hidden = false;
  list.innerHTML = incidents
    .map((i) => {
      const id = escapeHtml(i.id);
      const isAcked = ackedIds.has(i.id);
      const isPending = pendingIds.has(i.id);
      const action = isAcked
        ? `<span data-testid="acked" class="acked">Acked</span>`
        : `<button type="button" data-testid="ack" class="ack-btn"${isPending ? ' disabled' : ''}>Ack</button>`;

      return `<li data-testid="incident-row" data-id="${id}" class="row ${escapeHtml(i.severity)}">
        <span class="id">${id}</span>
        <span class="sev">${escapeHtml(i.severity)}</span>
        <span class="what">${escapeHtml(i.service)} · ${escapeHtml(i.region)} · ${escapeHtml(i.summary)}</span>
        <time datetime="${escapeHtml(i.openedAt)}">${escapeHtml(formatLocalTime(i.openedAt))}</time>
        <span class="action">${action}</span>
      </li>`;
    })
    .join('');
}

list.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const row = btn.closest('[data-testid="incident-row"]');
  if (!row) return;
  const id = row.dataset.id;
  if (!id || ackedIds.has(id) || pendingIds.has(id)) return;

  pendingIds.add(id);
  btn.disabled = true;
  try {
    await ack(id);
    ackedIds.add(id);
  } finally {
    pendingIds.delete(id);
    render(currentIncidents);
  }
});

async function refresh() {
  if (inFlight) return;
  inFlight = true;
  try {
    const page = await fetchIncidents();
    render(page.incidents);
  } catch (err) {
    console.error('refresh failed', err);
  } finally {
    inFlight = false;
  }
}

await refresh();
setInterval(refresh, 2000);
