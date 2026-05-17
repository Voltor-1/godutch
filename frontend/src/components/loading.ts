export function renderLoadingSpinner(): string {
  return '<div class="loading-spinner" aria-label="Loading" role="status"></div>';
}

export function renderSessionSkeleton(): string {
  return `
    <div class="card">
      <div class="skeleton-line medium"></div>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line short"></div>
    </div>
    <div class="card">
      <div class="skeleton-line medium"></div>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line full"></div>
    </div>
    <div class="card">
      <div class="skeleton-line medium"></div>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line full"></div>
    </div>
  `;
}
