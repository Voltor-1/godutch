export function showToast(message: string, durationMs = 2000): void {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 220);
  }, durationMs);
}
