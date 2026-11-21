import { fetchIncidents, ack } from './api.js';

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const confirmDialog = document.querySelector('[data-testid="confirm"]');
const confirmText = confirmDialog.querySelector('.confirm-text');
const confirmAckBtn = confirmDialog.querySelector('[data-testid="confirm-ack"]');
const confirmCancelBtn = confirmDialog.querySelector('[data-testid="confirm-cancel"]');

const ackedIds = new Set();
const pendingIds = new Set();
const rowMap = new Map();
let currentIncidents = [];
let confirmingId = null;
let inFlight = false;

const timeFormatter = new Intl.DateTimeFormat(navigator.language || undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatLocalTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return timeFormatter.format(date);
}

function updateRowAction(li, id) {
  const actionSpan = li.querySelector('.action');
  const isAcked = ackedIds.has(id);
  const isPending = pendingIds.has(id);

  if (isAcked) {
    if (!actionSpan.querySelector('[data-testid="acked"]')) {
      actionSpan.innerHTML = '<span data-testid="acked" class="acked">Acked</span>';
    }
  } else {
    let btn = actionSpan.querySelector('[data-testid="ack"]');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.testid = 'ack';
      btn.className = 'ack-btn';
      btn.textContent = 'Ack';
      actionSpan.innerHTML = '';
      actionSpan.appendChild(btn);
    }
    btn.disabled = isPending;
  }
}

function createRow(incident) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.dataset.id = incident.id;
  li.className = `row ${incident.severity}`;

  const idSpan = document.createElement('span');
  idSpan.className = 'id';
  idSpan.textContent = incident.id;

  const sevSpan = document.createElement('span');
  sevSpan.className = 'sev';
  sevSpan.textContent = incident.severity;

  const whatSpan = document.createElement('span');
  whatSpan.className = 'what';
  whatSpan.textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;

  const timeEl = document.createElement('time');
  timeEl.setAttribute('datetime', incident.openedAt);
  timeEl.textContent = formatLocalTime(incident.openedAt);

  const actionSpan = document.createElement('span');
  actionSpan.className = 'action';

  li.append(idSpan, sevSpan, whatSpan, timeEl, actionSpan);
  updateRowAction(li, incident.id);
  return li;
}

function openConfirm(id) {
  const incident = currentIncidents.find((i) => i.id === id);
  confirmingId = id;
  confirmText.textContent = incident
    ? `Ack incident ${id} (${incident.service} · ${incident.summary})?`
    : `Ack incident ${id}?`;
  confirmAckBtn.disabled = false;
  confirmDialog.hidden = false;
  confirmAckBtn.focus();
}

function closeConfirm() {
  confirmingId = null;
  confirmDialog.hidden = true;
}

function render(incidents) {
  currentIncidents = incidents;

  if (loader && loader.isConnected) {
    loader.remove();
  }

  if (incidents.length === 0) {
    empty.hidden = false;
    list.hidden = true;
    return;
  }

  empty.hidden = true;
  list.hidden = false;

  for (let idx = 0; idx < incidents.length; idx++) {
    const incident = incidents[idx];
    let li = rowMap.get(incident.id);
    if (!li) {
      li = createRow(incident);
      rowMap.set(incident.id, li);
      list.insertBefore(li, list.children[idx] || null);
    } else {
      updateRowAction(li, incident.id);
    }
  }
}

list.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const row = btn.closest('[data-testid="incident-row"]');
  if (!row) return;
  const id = row.dataset.id;
  if (!id || ackedIds.has(id) || pendingIds.has(id)) return;
  openConfirm(id);
});

confirmCancelBtn.addEventListener('click', () => {
  closeConfirm();
});

confirmAckBtn.addEventListener('click', async () => {
  const id = confirmingId;
  if (!id || ackedIds.has(id) || pendingIds.has(id)) {
    closeConfirm();
    return;
  }

  pendingIds.add(id);
  confirmAckBtn.disabled = true;
  try {
    await ack(id);
    ackedIds.add(id);
  } finally {
    pendingIds.delete(id);
    closeConfirm();
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
