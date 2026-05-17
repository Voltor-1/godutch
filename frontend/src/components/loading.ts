// ── Loading components ────────────────────────────────────────────
// Reusable spinner and session skeleton for loading states.

export function renderLoadingSpinner(): string {
  return '<div class="loading-spinner" aria-label="Loading..."></div>';
}

export function renderSessionSkeleton(): string {
  return `
    <div class="card">
      <div class="skeleton-line short" style="height:1.5rem;margin-bottom:0.5rem"></div>
      <div class="skeleton-line medium"></div>
      <div class="skeleton-line full"></div>
    </div>
    <div class="card">
      <div class="skeleton-line short" style="height:1rem;margin-bottom:0.75rem"></div>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line medium"></div>
    </div>
    <div class="card">
      <div class="skeleton-line short" style="height:1rem;margin-bottom:0.75rem"></div>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line full"></div>
    </div>
  `;
}
