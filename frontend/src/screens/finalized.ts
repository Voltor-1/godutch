// ── Finalized screen ──────────────────────────────────────────────
// Read-only summary shown after a session is finalized.

import type { SessionSnapshot, ParticipantTotalDTO } from '../api';
import { showShareModal } from '../components/shareModal';
import { formatCurrency } from '../store';

export function renderFinalized(
  container: HTMLElement,
  snapshot: SessionSnapshot,
  totals: ParticipantTotalDTO[],
): void {
  const { bill, participants } = snapshot;
  const participantMap = new Map(participants.map(p => [p.id, p]));

  const rows = totals
    .sort((a, b) => {
      const oa = participantMap.get(a.participantId)?.participantOrder ?? 0;
      const ob = participantMap.get(b.participantId)?.participantOrder ?? 0;
      return oa - ob;
    })
    .map(t => {
      const name = participantMap.get(t.participantId)?.displayName ?? 'Unknown';
      const extra = t.remainderCents > 0 ? ' <span style="font-size:0.75rem;color:var(--color-muted)">(+1¢ rounding)</span>' : '';
      return `<div class="total-row"><span>${name}</span><span><strong>${formatCurrency(t.totalOwedCents, bill.currencyCode)}</strong>${extra}</span></div>`;
    }).join('');

  container.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
        <h2 style="color:var(--color-primary)">${bill.title ?? 'Bill'}</h2>
        <span class="badge badge-finalized">Finalized</span>
      </div>
      <div class="total-row" style="margin-bottom:0.5rem">
        <span style="color:var(--color-muted)">Total</span>
        <span>${formatCurrency(bill.totalCents, bill.currencyCode)}</span>
      </div>
      <hr style="border:none;border-top:1px solid var(--color-border);margin:1rem 0" />
      <h3 style="margin-bottom:0.75rem;font-size:1rem">What each person owes</h3>
      ${rows}
      <p style="margin-top:1rem;font-size:0.8rem;color:var(--color-muted)">
        Remainders distributed by largest-remainder method. Read-only until ${new Date(bill.expiresAt).toLocaleDateString()}.
      </p>
      <button id="finalized-share-btn" class="btn btn-outline" style="width:100%;margin-top:1rem">Share</button>
    </div>
  `;

  const tokenMatch = window.location.hash.match(/^#\/session\/([a-f0-9]{64})$/);
  const token = tokenMatch?.[1];
  container.querySelector<HTMLButtonElement>('#finalized-share-btn')?.addEventListener('click', () => {
    if (!token) return;
    showShareModal(token, bill.title ?? 'Bill split');
  });
}
