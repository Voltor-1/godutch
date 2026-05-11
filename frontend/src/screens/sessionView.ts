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

function buildPercentageForm(participants: any[], configJson: any): string {
  const cfg = configJson as any;
  let rows = '';
  for (const p of participants) {
    const bp = cfg && cfg.percentages && cfg.percentages[p.id] ? cfg.percentages[p.id] : 0;
    const val = bp ? (bp / 100).toFixed(2) : '';
    rows += '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">';
    rows += '<label style="flex:1;margin:0;font-size:0.9rem">' + p.displayName + '</label>';
    rows += '<input class="pct-input" data-pid="' + p.id + '" type="number" min="0" max="100" step="0.01" placeholder="0" value="' + val + '" style="width:80px;padding:0.4rem;border:1px solid var(--color-border);border-radius:var(--radius);text-align:right" />';
    rows += '<span style="font-size:0.9rem">%</span>';
    rows += '</div>';
  }
  return '<div id="percentage-form">'
    + '<p style="font-size:0.85rem;color:var(--color-muted);margin-bottom:0.5rem">Enter each person's share. Must total 100%.</p>'
    + rows
    + '<div id="pct-total-display" style="font-size:0.875rem;margin-bottom:0.5rem;font-weight:600"></div>'
    + '<button id="set-pct-btn" class="btn btn-primary" style="width:100%">Set percentages</button>'
    + '<div id="pct-error" class="error-msg" style="margin-top:0.35rem"></div>'
    + '</div>';
}

function buildFixedForm(participants: any[], configJson: any, totalCents: number, currencyCode: string): string {
  const cfg = configJson as any;
  let rows = '';
  for (const p of participants) {
    const cents = cfg && cfg.fixedAmounts && cfg.fixedAmounts[p.id] ? cfg.fixedAmounts[p.id] : 0;
    const val = cents ? (cents / 100).toFixed(2) : '';
    rows += '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">';
    rows += '<label style="flex:1;margin:0;font-size:0.9rem">' + p.displayName + '</label>';
    rows += '<span style="font-size:0.9rem">$</span>';
    rows += '<input class="fixed-input" data-pid="' + p.id + '" type="number" min="0" step="0.01" placeholder="0.00" value="' + val + '" style="width:90px;padding:0.4rem;border:1px solid var(--color-border);border-radius:var(--radius);text-align:right" />';
    rows += '</div>';
  }
  return '<div id="fixed-form">'
    + '<p style="font-size:0.85rem;color:var(--color-muted);margin-bottom:0.5rem">Enter each person's fixed amount.</p>'
    + rows
    + '<div id="fixed-remainder-display" style="font-size:0.875rem;margin-bottom:0.5rem;font-weight:600"></div>'
    + '<button id="set-fixed-btn" class="btn btn-primary" style="width:100%">Set amounts</button>'
    + '<div id="fixed-error" class="error-msg" style="margin-top:0.35rem"></div>'
    + '</div>';
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
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem">
          <button class="btn split-mode-btn ${snapshot.splitRules?.[0]?.splitMode === 'items' ? 'btn-primary' : 'btn-outline'}" data-mode="items">By items</button>
          <button class="btn split-mode-btn ${snapshot.splitRules?.[0]?.splitMode === 'percentage' ? 'btn-primary' : 'btn-outline'}" data-mode="percentage">By percentage</button>
          <button class="btn split-mode-btn ${snapshot.splitRules?.[0]?.splitMode === 'fixed' ? 'btn-primary' : 'btn-outline'}" data-mode="fixed">Fixed amount</button>
        </div>
        <div id="split-mode-form"></div>
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

    // ── Inject split mode forms ──────────────────────────────────────
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

    // Percentage form
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

    // Fixed amount form
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
