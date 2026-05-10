// ── Session screen ─────────────────────────────────────────────────
// Main shared view. Polls for updates. Shows bill, participants,
// items, split mode controls, compute, and finalize.

import {
  getSession, computeSplit, finalizeSession, setSplitMode,
  upsertAllocation, ApiError,
  type SessionSnapshot, type ParticipantTotalDTO,
} from '../api';
import {
  getStoredParticipant, formatCurrency, dollarsToCents,
  type SessionState, createSessionState,
} from '../store';
import { createPoller } from '../polling';
import { showJoinModal } from '../components/joinModal';
import { showAddItemModal } from '../components/addItemModal';
import { renderFinalized } from './finalized';

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
    </header>
    <div class="container">
      <div id="session-error" class="error-msg" style="margin:1rem 0"></div>
      <div id="session-content"></div>
    </div>
  `;

  const subtitle = app.querySelector<HTMLElement>('#session-subtitle')!;
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

    if (isFinalized && state.totals) {
      content.innerHTML = '';
      renderFinalized(content, snapshot, state.totals);
      poller?.stop();
      return;
    }

    // Share link section
    const shareUrl = `${window.location.origin}${window.location.pathname}#/session/${token}`;

    // Participants section
    const participantRows = participants.map(p =>
      `<div class="participant-row"><span>${p.displayName}</span>${p.id === stored?.participantId ? '<span style="font-size:0.75rem;color:var(--color-primary)">you</span>' : ''}</div>`
    ).join('') || '<p style="color:var(--color-muted);font-size:0.9rem">No participants yet.</p>';

    // Items section
    const itemRows = items.map(item => {
      const allocBtns = participants.map(p => {
        const isMe = p.id === stored?.participantId;
        return isMe
          ? `<button class="btn btn-outline alloc-btn" data-item="${item.id}" data-cents="${item.lineTotalCents}" style="font-size:0.75rem;padding:0.3rem 0.6rem">Claim</button>`
          : '';
      }).join('');
      return `<div class="item-row"><span>${item.name} × ${item.quantity}<br><small style="color:var(--color-muted)">${formatCurrency(item.lineTotalCents, bill.currencyCode)}</small></span><span>${allocBtns}</span></div>`;
    }).join('') || '<p style="color:var(--color-muted);font-size:0.9rem">No items yet.</p>';

    content.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:1.5rem;font-weight:700;color:var(--color-primary)">${formatCurrency(bill.totalCents, bill.currencyCode)}</div>
            <div style="font-size:0.8rem;color:var(--color-muted)">Subtotal ${formatCurrency(bill.subtotalCents, bill.currencyCode)} · Tax ${formatCurrency(bill.taxCents, bill.currencyCode)} · Tip ${formatCurrency(bill.tipCents, bill.currencyCode)}</div>
          </div>
          <span class="badge badge-${bill.status}">${bill.status}</span>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
          <h3>Participants (${participants.length})</h3>
          ${!stored ? '<button id="join-btn" class="btn btn-primary" style="font-size:0.85rem">Join</button>' : ''}
        </div>
        ${participantRows}
        <div style="margin-top:0.75rem">
          <button id="copy-link-btn" class="btn btn-outline" style="font-size:0.8rem;width:100%">Copy share link</button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
          <h3>Items (${items.length})</h3>
          <button id="add-item-btn" class="btn btn-outline" style="font-size:0.85rem">+ Add item</button>
        </div>
        ${itemRows}
      </div>

      <div class="card">
        <h3 style="margin-bottom:0.75rem">Split mode</h3>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn split-mode-btn ${snapshot.splitRules?.[0]?.splitMode === 'items' ? 'btn-primary' : 'btn-outline'}" data-mode="items">By items</button>
          <button class="btn split-mode-btn ${snapshot.splitRules?.[0]?.splitMode === 'percentage' ? 'btn-primary' : 'btn-outline'}" data-mode="percentage">By percentage</button>
          <button class="btn split-mode-btn ${snapshot.splitRules?.[0]?.splitMode === 'fixed' ? 'btn-primary' : 'btn-outline'}" data-mode="fixed">Fixed amount</button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;gap:0.5rem">
          <button id="compute-btn" class="btn btn-outline" style="flex:1">Calculate</button>
          <button id="finalize-btn" class="btn btn-primary" style="flex:1">Finalize</button>
        </div>
        <div id="compute-error" class="error-msg" style="margin-top:0.5rem"></div>
        <div id="totals-section" style="margin-top:1rem"></div>
      </div>
    `;

    // ── Event listeners ───────────────────────────────────────────

    app.querySelector('#join-btn')?.addEventListener('click', () => {
      showJoinModal(token, () => fetchSession());
    });

    app.querySelector('#copy-link-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
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

    // Re-render existing totals if available
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
        const extra = t.remainderCents > 0 ? ' <small style="color:var(--color-muted)">(+1¢)</small>' : '';
        return `<div class="total-row"><span>${name}</span><span>${formatCurrency(t.totalOwedCents, snapshot.bill.currencyCode)}${extra}</span></div>`;
      }).join('');
    section.innerHTML = `<h4 style="margin-bottom:0.5rem">Split result</h4>${rows}`;
  }

  // Start polling
  poller = createPoller({ onFetch: fetchSession });
  fetchSession().then(() => poller?.start());
}
