export function renderLoadingSpinner(): string {
  return `<div class="card"><div class="loading-spinner" aria-label="Loading"></div></div>`;
}

export function renderSessionSkeleton(): string {
  return `
    <div class="card skeleton">
      <div class="card-header">
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line medium"></div>
    </div>
    <div class="card skeleton">
      <h3 class="section-heading">Participants</h3>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line medium"></div>
    </div>
    <div class="card skeleton">
      <h3 class="section-heading">Items</h3>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line short"></div>
    </div>
  `;
}
