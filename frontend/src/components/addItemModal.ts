// ── Add item modal ────────────────────────────────────────────────
// Owner adds a bill item — name, quantity, unit price.
// lineTotalCents computed and displayed before submit.

import { addItem, ApiError, type BillItemDTO } from '../api';
import { dollarsToCents, formatCurrency } from '../store';

export function showAddItemModal(
  shareToken: string,
  currencyCode: string,
  onAdded: (item: BillItemDTO) => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2 style="color:var(--color-primary)">Add item</h2>
      <div class="form-group">
        <label for="item-name">Item name</label>
        <input id="item-name" type="text" placeholder="e.g. Grilled salmon" maxlength="200" />
      </div>
      <div class="form-group">
        <label for="item-qty">Quantity</label>
        <input id="item-qty" type="number" min="1" step="1" value="1" />
      </div>
      <div class="form-group">
        <label for="item-price">Unit price</label>
        <input id="item-price" type="number" min="0" step="0.01" placeholder="0.00" />
      </div>
      <div id="item-total-preview" style="margin-bottom:0.5rem;font-weight:600;color:var(--color-primary)"></div>
      <div id="item-error" class="error-msg"></div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button id="item-cancel" class="btn btn-outline" style="flex:1">Cancel</button>
        <button id="item-confirm" class="btn btn-primary" style="flex:2">Add item</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const nameEl = overlay.querySelector<HTMLInputElement>('#item-name')!;
  const qtyEl = overlay.querySelector<HTMLInputElement>('#item-qty')!;
  const priceEl = overlay.querySelector<HTMLInputElement>('#item-price')!;
  const totalPreview = overlay.querySelector<HTMLElement>('#item-total-preview')!;
  const errorEl = overlay.querySelector<HTMLElement>('#item-error')!;
  const confirmBtn = overlay.querySelector<HTMLButtonElement>('#item-confirm')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('#item-cancel')!;

  function updatePreview(): void {
    const qty = Math.max(1, parseInt(qtyEl.value) || 1);
    const unit = dollarsToCents(priceEl.value || '0');
    const total = qty * unit;
    totalPreview.textContent = total > 0 ? `Line total: ${formatCurrency(total, currencyCode)}` : '';
  }

  [qtyEl, priceEl].forEach(el => el.addEventListener('input', updatePreview));

  function close(): void { overlay.remove(); }
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  confirmBtn.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    const quantity = Math.max(1, parseInt(qtyEl.value) || 1);
    const unitPriceCents = dollarsToCents(priceEl.value || '0');
    if (!name) { errorEl.textContent = 'Item name is required.'; return; }
    if (unitPriceCents <= 0) { errorEl.textContent = 'Unit price must be greater than zero.'; return; }
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Adding…';
    errorEl.textContent = '';
    try {
      const item = await addItem(shareToken, { name, quantity, unitPriceCents });
      close();
      onAdded(item);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to add item.';
      errorEl.textContent = msg;
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Add item';
    }
  });

  setTimeout(() => nameEl.focus(), 50);
}
