export function DashboardSkeleton() {
  return (
    <div
      className="dashboard-skeleton"
      role="status"
      aria-label="Loading your dashboard"
      aria-busy="true"
    >
      <span className="sr-only">Loading your dashboard</span>
      <div className="skeleton-line" />
      <div className="skeleton-cards">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="skeleton-card" />
        ))}
      </div>
      <div className="skeleton-chart" />
      {[1, 2, 3].map((n) => (
        <div key={n} className="skeleton-line" />
      ))}
    </div>
  );
}
