// ── Session screen ─────────────────────────────────────────────────
// Main shared view. Polls for updates. Shows bill, participants,
// items, split mode controls, compute, and finalize.

import {
  getSession, computeSplit, finalizeSession, setSplitMode,
  upsertAllocation, deleteSession, ApiError,
  type SessionSnapshot, type ParticipantTotalDTO,
} from '../api';
import {
  getStoredParticipant, formatCurrency, dollarsToCents,
  type SessionState, createSessionState,
} from '../store';
import { createPoller } from '../polling';
import { showJoinModal } from '../components/joinModal';
import { showAddItemModal } from '../components/addItemModal';
import { showShareModal } from '../components/shareModal';
import { renderSessionSkeleton } from '../components/loading';
import { renderFinalized } from './finalized';

function buildPercentageForm(participants: any[], configJson: any): string {
  const cfg = configJson as any;
  let rows = '';
  for (const p of participants) {
    const bp = cfg && cfg.percentages && cfg.percentages[p.id] ? cfg.percentages[p.id] : 0;
    const val = bp ? (bp / 100).toFixed(2) : '';
    rows += `<div class="split-row">
      <label>${p.displayName}</label>
      <input class="pct-input split-input" data-pid="${p.id}" type="number" min="0" max="100" step="0.01" placeholder="0" value="${val}" />
      <span class="split-unit">%</span>
    </div>`;
  }
  return `<div id="percentage-form">
    <p class="text-sm text-muted" style="margin-bottom:var(--spacing-sm)">Enter each person's share. Must total 100%.</p>
    ${rows}
    <div id="pct-total-display" class="text-sm font-semibold" style="margin-bottom:var(--spacing-sm)"></div>
    <button id="set-pct-btn" class="btn btn-primary btn-full">Set percentages</button>
    <div id="pct-error" class="error-msg" style="margin-top:0.35rem"></div>
  </div>`;
}

function buildFixedForm(participants: any[], configJson: any, totalCents: number, currencyCode: string): string {
  const cfg = configJson as any;
  let rows = '';
  for (const p of participants) {
    const cents = cfg && cfg.fixedAmounts && cfg.fixedAmounts[p.id] ? cfg.fixedAmounts[p.id] : 0;
    const val = cents ? (cents / 100).toFixed(2) : '';
    rows += `<div class="split-row">
      <label>${p.displayName}</label>
      <span class="split-unit">$</span>
      <input class="fixed-input split-input" data-pid="${p.id}" type="number" min="0" step="0.01" placeholder="0.00" value="${val}" />
    </div>`;
  }
  return `<div id="fixed-form">
    <p class="text-sm text-muted" style="margin-bottom:var(--spacing-sm)">Enter each person's fixed amount.</p>
    ${rows}
    <div id="fixed-remainder-display" class="text-sm font-semibold" style="margin-bottom:var(--spacing-sm)"></div>
    <button id="set-fixed-btn" class="btn btn-primary btn-full">Set amounts</button>
    <div id="fixed-error" class="error-msg" style="margin-top:0.35rem"></div>
  </div>`;
}

export function renderSession(
  app: HTMLElement,
  token: string,
  navigate: (path: string) => void,
): void {
  const state: SessionState = createSessionState();
  let poller: ReturnType<typeof createPoller> | null = null;

  app.innerHTML = `
    <header class="app-header">
      <h1>GoDutch</h1>
      <p id="session-subtitle">Loading session…</p>
      <span id="participant-badge" class="participant-badge" style="display:none"></span>
    </header>
    <div class="container">
      <div id="session-error" class="error-msg" style="margin:var(--spacing-md) 0"></div>
      <div id="session-content">${renderSessionSkeleton()}</div>
    </div>
  `;

  const subtitle = app.querySelector<HTMLElement>('#session-subtitle')!;
  const participantBadge = app.querySelector<HTMLElement>('#participant-badge')!;
  const errorEl = app.querySelector<HTMLElement>('#session-error')!;
  const content = app.querySelector<HTMLElement>('#session-content')!;

  async function fetchSession(): Promise<void> {
    try {
      const snapshot = await getSession(token);
      state.snapshot = snapshot;
      state.lastFetchedAt = Date.now();
      state.error = null;
      errorEl.textContent = '';
      renderContent(snapshot);
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) {
        poller?.stop();
        content.innerHTML = '<div class="card"><p>This session has expired or does not exist.</p><a href="#/">Start a new session</a></div>';
        return;
      }
      state.error = e instanceof ApiError ? e.message : 'Failed to load session.';
      errorEl.textContent = state.error;
    }
  }

  function renderContent(snapshot: SessionSnapshot): void {
    const { bill, participants, items } = snapshot;
    const stored = getStoredParticipant(token);
    const isFinalized = bill.status === 'finalized';

    subtitle.textContent = bill.title ?? 'Split session';
    const count = participants.length;
    participantBadge.textContent = `👥 ${count} ${count === 1 ? 'participant' : 'participants'}`;
    participantBadge.style.display = '';

    if (isFinalized && state.totals) {
      content.innerHTML = '';
      renderFinalized(content, snapshot, state.totals);
      poller?.stop();
      return;
    }

    const participantRows = participants.map(p =>
      `<div class="participant-row">
        <span>${p.displayName}</span>
        ${p.id === stored?.participantId ? '<span class="text-xs text-primary">you</span>' : ''}
      </div>`
    ).join('') || '<p class="text-sm text-muted">No participants yet.</p>';

    const itemRows = items.map(item => {
      const allocBtns = participants.map(p => {
        const isMe = p.id === stored?.participantId;
        return isMe
          ? `<button class="btn btn-outline alloc-btn" data-item="${item.id}" data-cents="${item.lineTotalCents}" style="font-size:var(--font-size-xs);padding:0.3rem 0.6rem">Claim</button>`
          : '';
      }).join('');
      return `<div class="item-row">
        <span>${item.name} × ${item.quantity}<br><small class="text-muted">${formatCurrency(item.lineTotalCents, bill.currencyCode)}</small></span>
        <span>${allocBtns}</span>
      </div>`;
    }).join('') || '<p class="text-sm text-muted">No items yet.</p>';

    content.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="text-2xl text-primary">${formatCurrency(bill.totalCents, bill.currencyCode)}</div>
            <div class="text-xs text-muted">Subtotal ${formatCurrency(bill.subtotalCents, bill.currencyCode)} · Tax ${formatCurrency(bill.taxCents, bill.currencyCode)} · Tip ${formatCurrency(bill.tipCents, bill.currencyCode)}</div>
          </div>
          <span class="badge badge-${bill.status}">${bill.status}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="section-heading" style="margin-bottom:0">Participants (${participants.length})</h3>
          ${!stored ? '<button id="join-btn" class="btn btn-primary" style="font-size:var(--font-size-sm)">Join</button>' : ''}
        </div>
        ${participantRows}
        <div style="margin-top:var(--spacing-md)">
          <button id="share-btn" class="btn btn-outline btn-full" style="font-size:var(--font-size-sm)">📤 Share session</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="section-heading" style="margin-bottom:0">Items (${items.length})</h3>
          <button id="add-item-btn" class="btn btn-outline" style="font-size:var(--font-size-sm)">+ Add item</button>
        </div>
        ${itemRows}
      </div>

      <div class="card">
        <h3 class="section-heading">Split mode</h3>
        <div style="display:flex;gap:var(--spacing-sm);flex-wrap:wrap;margin-bottom:var(--spacing-md)">
          <button class="btn split-mode-btn ${snapshot.splitRules?.[0]?.splitMode === 'items' ? 'btn-primary' : 'btn-outline'}" data-mode="items">By items</button>
          <button class="btn split-mode-btn ${snapshot.splitRules?.[0]?.splitMode === 'percentage' ? 'btn-primary' : 'btn-outline'}" data-mode="percentage">By percentage</button>
          <button class="btn split-mode-btn ${snapshot.splitRules?.[0]?.splitMode === 'fixed' ? 'btn-primary' : 'btn-outline'}" data-mode="fixed">Fixed amount</button>
        </div>
        <div id="split-mode-form"></div>
      </div>

      <div class="card">
        <div style="display:flex;gap:var(--spacing-sm)">
          <button id="compute-btn" class="btn btn-outline" style="flex:1">Calculate</button>
          <button id="finalize-btn" class="btn btn-primary" style="flex:1">Finalize</button>
        </div>
        <div id="compute-error" class="error-msg" style="margin-top:var(--spacing-sm)"></div>
        <div id="totals-section" style="margin-top:var(--spacing-md)"></div>
      </div>

      ${(() => {
        const isOwner = stored && participants.some(
          p => p.id === stored.participantId && p.participantOrder === 1
        );
        return isOwner ? `
          <div class="card" style="border:1px solid var(--color-danger)">
            <h3 class="text-sm" style="color:var(--color-danger);margin-bottom:var(--spacing-sm)">Danger zone</h3>
            <p class="text-xs text-muted" style="margin-bottom:var(--spacing-sm)">Permanently expire this session. This cannot be undone.</p>
            <button id="delete-session-btn" class="btn btn-danger btn-full">Delete Session</button>
            <div id="delete-error" class="error-msg" style="margin-top:0.35rem"></div>
          </div>
        ` : '';
      })()}
    `;

    const formContainer = app.querySelector<HTMLElement>('#split-mode-form');
    if (formContainer) {
      const activeRule = snapshot.splitRules && snapshot.splitRules[0];
      const activeMode = activeRule ? activeRule.splitMode : null;
      const activeCfg = activeRule ? activeRule.configJson : null;
      if (activeMode === 'percentage') {
        formContainer.innerHTML = buildPercentageForm(participants, activeCfg);
      } else if (activeMode === 'fixed') {
        formContainer.innerHTML = buildFixedForm(participants, activeCfg, bill.totalCents, bill.currencyCode);
      }
    }

    app.querySelector('#join-btn')?.addEventListener('click', () => {
      showJoinModal(token, () => fetchSession());
    });

    app.querySelector('#share-btn')?.addEventListener('click', () => {
      showShareModal(token, bill.title ?? 'Bill split');
    });

    app.querySelector('#add-item-btn')?.addEventListener('click', () => {
      showAddItemModal(token, bill.currencyCode, () => fetchSession());
    });

    app.querySelectorAll<HTMLButtonElement>('.split-mode-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = btn.dataset.mode as 'items' | 'percentage' | 'fixed';
        try {
          await setSplitMode(token, mode);
          fetchSession();
        } catch (e) {
          const computeError = app.querySelector<HTMLElement>('#compute-error')!;
          computeError.textContent = e instanceof ApiError ? e.message : 'Failed to set split mode.';
        }
      });
    });

    const pctInputs = app.querySelectorAll<HTMLInputElement>('.pct-input');
    const pctTotalDisplay = app.querySelector<HTMLElement>('#pct-total-display');
    const setPctBtn = app.querySelector<HTMLButtonElement>('#set-pct-btn');
    const pctError = app.querySelector<HTMLElement>('#pct-error');

    function updatePctTotal(): void {
      if (!pctTotalDisplay) return;
      let total = 0;
      pctInputs.forEach(i => { total += parseFloat(i.value || '0'); });
      const rounded = Math.round(total * 100) / 100;
      pctTotalDisplay.textContent = `Total: ${rounded.toFixed(2)}%`;
      pctTotalDisplay.style.color = Math.abs(rounded - 100) < 0.01 ? 'var(--color-success)' : 'var(--color-danger)';
    }

    pctInputs.forEach(i => i.addEventListener('input', updatePctTotal));
    updatePctTotal();

    setPctBtn?.addEventListener('click', async () => {
      if (!pctError) return;
      pctError.textContent = '';
      const percentages: Record<string, number> = {};
      let basisTotal = 0;
      pctInputs.forEach(i => {
        const bp = Math.round(parseFloat(i.value || '0') * 100);
        percentages[i.dataset.pid!] = bp;
        basisTotal += bp;
      });
      if (basisTotal !== 10000) {
        pctError.textContent = `Percentages must total 100% (currently ${(basisTotal/100).toFixed(2)}%)`;
        return;
      }
      setPctBtn.disabled = true;
      try {
        await setSplitMode(token, 'percentage', { percentages });
        fetchSession();
      } catch (e) {
        pctError.textContent = e instanceof ApiError ? e.message : 'Failed to set percentages.';
        setPctBtn.disabled = false;
      }
    });

    const fixedInputs = app.querySelectorAll<HTMLInputElement>('.fixed-input');
    const fixedRemainderDisplay = app.querySelector<HTMLElement>('#fixed-remainder-display');
    const setFixedBtn = app.querySelector<HTMLButtonElement>('#set-fixed-btn');
    const fixedError = app.querySelector<HTMLElement>('#fixed-error');

    function updateFixedRemainder(): void {
      if (!fixedRemainderDisplay) return;
      let totalFixed = 0;
      fixedInputs.forEach(i => { totalFixed += Math.round(parseFloat(i.value || '0') * 100); });
      const remainder = snapshot.bill.totalCents - totalFixed;
      fixedRemainderDisplay.textContent = `Remainder: ${formatCurrency(remainder, snapshot.bill.currencyCode)}`;
      fixedRemainderDisplay.style.color = remainder >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    }

    fixedInputs.forEach(i => i.addEventListener('input', updateFixedRemainder));
    updateFixedRemainder();

    setFixedBtn?.addEventListener('click', async () => {
      if (!fixedError) return;
      fixedError.textContent = '';
      const fixedAmounts: Record<string, number> = {};
      let totalFixed = 0;
      fixedInputs.forEach(i => {
        const cents = Math.round(parseFloat(i.value || '0') * 100);
        fixedAmounts[i.dataset.pid!] = cents;
        totalFixed += cents;
      });
      if (totalFixed > snapshot.bill.totalCents) {
        fixedError.textContent = 'Fixed amounts exceed the bill total.';
        return;
      }
      setFixedBtn.disabled = true;
      try {
        await setSplitMode(token, 'fixed', { fixedAmounts });
        fetchSession();
      } catch (e) {
        fixedError.textContent = e instanceof ApiError ? e.message : 'Failed to set amounts.';
        setFixedBtn.disabled = false;
      }
    });

    app.querySelectorAll<HTMLButtonElement>('.alloc-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!stored) { alert('Join the session first to claim items.'); return; }
        const itemId = btn.dataset.item!;
        const cents = parseInt(btn.dataset.cents ?? '0');
        try {
          await upsertAllocation(token, {
            participantToken: stored.participantToken,
            itemId,
            allocatedCents: cents,
          });
          fetchSession();
        } catch (e) {
          alert(e instanceof ApiError ? e.message : 'Failed to claim item.');
        }
      });
    });

    app.querySelector('#compute-btn')?.addEventListener('click', async () => {
      const computeError = app.querySelector<HTMLElement>('#compute-error')!;
      computeError.textContent = '';
      try {
        const totals = await computeSplit(token);
        state.totals = totals;
        renderTotals(totals, snapshot);
      } catch (e) {
        computeError.textContent = e instanceof ApiError ? e.message : 'Calculation failed.';
      }
    });

    app.querySelector('#finalize-btn')?.addEventListener('click', async () => {
      const computeError = app.querySelector<HTMLElement>('#compute-error')!;
      if (!state.totals) { computeError.textContent = 'Run Calculate first.'; return; }
      if (!confirm('Finalize this session? This cannot be undone.')) return;
      try {
        await finalizeSession(token);
        fetchSession();
      } catch (e) {
        computeError.textContent = e instanceof ApiError ? e.message : 'Finalization failed.';
      }
    });

    app.querySelector('#delete-session-btn')?.addEventListener('click', async () => {
      if (!stored) return;
      if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) return;
      const deleteBtn = app.querySelector('#delete-session-btn');
      const deleteError = app.querySelector('#delete-error');
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting…';
      deleteError.textContent = '';
      try {
        await deleteSession(token, stored.participantToken);
        poller?.stop();
        navigate('/');
      } catch (e) {
        deleteError.textContent = e instanceof ApiError ? e.message : 'Failed to delete session.';
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete Session';
      }
    });

    if (state.totals) renderTotals(state.totals, snapshot);
  }

  function renderTotals(totals: ParticipantTotalDTO[], snapshot: SessionSnapshot): void {
    const section = app.querySelector<HTMLElement>('#totals-section');
    if (!section) return;
    const participantMap = new Map(snapshot.participants.map(p => [p.id, p]));
    const rows = totals
      .sort((a, b) => {
        const oa = participantMap.get(a.participantId)?.participantOrder ?? 0;
        const ob = participantMap.get(b.participantId)?.participantOrder ?? 0;
        return oa - ob;
      })
      .map(t => {
        const name = participantMap.get(t.participantId)?.displayName ?? 'Unknown';
        const extra = t.remainderCents > 0 ? ' <small class="text-muted">(+1¢)</small>' : '';
        return `<div class="total-row"><span>${name}</span><span>${formatCurrency(t.totalOwedCents, snapshot.bill.currencyCode)}${extra}</span></div>`;
      }).join('');
    section.innerHTML = `<h4 class="section-heading">Split result</h4>${rows}`;
  }

  poller = createPoller({ onFetch: fetchSession });
  fetchSession().then(() => poller?.start());
}
