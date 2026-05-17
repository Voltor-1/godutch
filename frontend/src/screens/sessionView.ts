
    // Delete session handler
    app.querySelector('#delete-session-btn')?.addEventListener('click', async () => {
      if (!stored) return;
      if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) return;
      const deleteBtn = app.querySelector<HTMLButtonElement>('#delete-session-btn')!;
      const deleteError = app.querySelector<HTMLElement>('#delete-error')!;
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

    // Re-render existing totals if available
    if (state.totals) renderTotals(state.totals, snapshot);
