import { showToast } from './toast';

export function showShareModal(token: string, sessionTitle: string): void {
  const shareUrl = `${window.location.origin}${window.location.pathname}#/session/${token}`;
  const message = `Join our bill split on GoDutch!\n${sessionTitle}\n${shareUrl}`;

  if (navigator.share) {
    navigator
      .share({ title: sessionTitle, text: message, url: shareUrl })
      .then(() => {
        showToast('Shared successfully');
      })
      .catch(() => {
        renderFallback();
      });
    return;
  }

  renderFallback();

  function renderFallback(): void {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal share-modal">
        <h2 style="color:var(--color-primary)">Share session</h2>
        <p style="margin-bottom:1rem;color:var(--color-muted);font-size:0.9rem">
          Share this bill using your preferred app.
        </p>
        <div class="share-option-grid">
          <button class="btn share-option-btn" id="share-whatsapp">WhatsApp</button>
          <button class="btn share-option-btn" id="share-sms">SMS</button>
          <button class="btn share-option-btn" id="share-copy">Copy link</button>
        </div>
        <button class="btn btn-outline" id="share-close" style="width:100%;margin-top:1rem">Close</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = (): void => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.querySelector<HTMLButtonElement>('#share-close')?.addEventListener('click', close);

    overlay.querySelector<HTMLButtonElement>('#share-whatsapp')?.addEventListener('click', () => {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    });

    overlay.querySelector<HTMLButtonElement>('#share-sms')?.addEventListener('click', () => {
      window.location.href = `sms:?body=${encodeURIComponent(message)}`;
    });

    overlay.querySelector<HTMLButtonElement>('#share-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Copied!');
      } catch {
        showToast('Failed to copy link');
      }
    });
  }
}
