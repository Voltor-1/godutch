// ── Join modal ────────────────────────────────────────────────────
// Guest enters display name to join a session.

import { addParticipant, ApiError, type ParticipantDTO } from '../api';
import { storeParticipant } from '../store';

export function showJoinModal(
  shareToken: string,
  onJoined: (participant: ParticipantDTO) => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2 class="text-primary">Join this session</h2>
      <p class="text-sm text-muted" style="margin-bottom:var(--spacing-md)">
        Enter your name so others can see who owes what.
      </p>
      <div class="form-group">
        <label for="join-name">Your name</label>
        <input id="join-name" type="text" placeholder="e.g. Alex" maxlength="100" autofocus />
      </div>
      <div id="join-error" class="error-msg"></div>
      <div style="display:flex;gap:var(--spacing-sm);margin-top:var(--spacing-md)">
        <button id="join-cancel" class="btn btn-outline" style="flex:1">Cancel</button>
        <button id="join-confirm" class="btn btn-primary" style="flex:2">Join</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector<HTMLInputElement>('#join-name')!;
  const errorEl = overlay.querySelector<HTMLElement>('#join-error')!;
  const confirmBtn = overlay.querySelector<HTMLButtonElement>('#join-confirm')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('#join-cancel')!;

  function close(): void { overlay.remove(); }
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmBtn.click(); });

  confirmBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { errorEl.textContent = 'Please enter your name.'; return; }
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Joining…';
    errorEl.textContent = '';
    try {
      const participant = await addParticipant(shareToken, name);
      if (participant.participantToken) {
        storeParticipant(shareToken, {
          participantId: participant.id,
          participantToken: participant.participantToken,
          displayName: participant.displayName,
        });
      }
      close();
      onJoined(participant);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to join. Please try again.';
      errorEl.textContent = msg;
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Join';
    }
  });

  setTimeout(() => nameInput.focus(), 50);
}
