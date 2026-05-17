// ── Home screen ───────────────────────────────────────────────────
// Creates a new bill session and redirects to the session view.

import { createSession, ApiError } from '../api';
import { dollarsToCents } from '../store';

export function renderHome(app: HTMLElement, navigate: (path: string) => void): void {
  app.innerHTML = `
    <header class="app-header">
      <h1>GoDutch</h1>
      <p>Split bills fairly — by items, percentage, or fixed amount</p>
    </header>
    <div class="container">
      <div class="card">
        <h2 class="text-xl text-primary" style="margin-bottom:var(--spacing-md)">New bill session</h2>
        <div class="form-group">
          <label for="title">Title (optional)</label>
          <input id="title" type="text" placeholder="e.g. Dinner at La Mar" maxlength="200" />
        </div>
        <div class="form-group">
          <label for="subtotal">Subtotal ($)</label>
          <input id="subtotal" type="number" min="0" step="0.01" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label for="tax">Tax ($)</label>
          <input id="tax" type="number" min="0" step="0.01" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label for="tip">Tip ($)</label>
          <input id="tip" type="number" min="0" step="0.01" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label for="service">Service charge ($)</label>
          <input id="service" type="number" min="0" step="0.01" placeholder="0.00" />
        </div>
        <div id="total-preview" class="font-semibold text-primary" style="margin-bottom:var(--spacing-md)"></div>
        <div id="home-error" class="error-msg"></div>
        <button id="create-btn" class="btn btn-primary btn-full" style="margin-top:var(--spacing-sm)">
          Create session &amp; get share link
        </button>
      </div>
    </div>
  `;

  const subtotalEl = app.querySelector<HTMLInputElement>('#subtotal')!;
  const taxEl = app.querySelector<HTMLInputElement>('#tax')!;
  const tipEl = app.querySelector<HTMLInputElement>('#tip')!;
  const serviceEl = app.querySelector<HTMLInputElement>('#service')!;
  const totalPreview = app.querySelector<HTMLElement>('#total-preview')!;
  const errorEl = app.querySelector<HTMLElement>('#home-error')!;
  const createBtn = app.querySelector<HTMLButtonElement>('#create-btn')!;

  function updateTotal(): void {
    const s = dollarsToCents(subtotalEl.value || '0');
    const t = dollarsToCents(taxEl.value || '0');
    const ti = dollarsToCents(tipEl.value || '0');
    const sv = dollarsToCents(serviceEl.value || '0');
    const total = s + t + ti + sv;
    totalPreview.textContent = total > 0 ? `Total: $${(total / 100).toFixed(2)}` : '';
  }

  [subtotalEl, taxEl, tipEl, serviceEl].forEach(el => el.addEventListener('input', updateTotal));

  createBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    const title = (app.querySelector<HTMLInputElement>('#title')!).value.trim() || undefined;
    const subtotalCents = dollarsToCents(subtotalEl.value || '0');
    const taxCents = dollarsToCents(taxEl.value || '0');
    const tipCents = dollarsToCents(tipEl.value || '0');
    const serviceChargeCents = dollarsToCents(serviceEl.value || '0');

    if (subtotalCents <= 0) {
      errorEl.textContent = 'Subtotal must be greater than zero.';
      return;
    }

    createBtn.disabled = true;
    createBtn.textContent = 'Creating…';

    try {
      const bill = await createSession({ title, subtotalCents, taxCents, tipCents, serviceChargeCents });
      const shareUrl = `${window.location.origin}${window.location.pathname}#/session/${bill.shareToken}`;
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
      navigate(`/session/${bill.shareToken}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to create session. Please try again.';
      errorEl.textContent = msg;
      createBtn.disabled = false;
      createBtn.textContent = 'Create session & get share link';
    }
  });
}
