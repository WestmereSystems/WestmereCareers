export function HomeRolesSkeleton() {
  return (
    <div
      className="home-roles-skeleton"
      role="status"
      aria-label="Loading featured opportunities"
      aria-busy="true"
    >
      <span className="sr-only">Loading featured opportunities</span>
      {[1, 2, 3].map((number) => (
        <div className="home-role-placeholder" key={number} aria-hidden="true">
          <span className="home-placeholder home-role-logo" />
          <span className="home-placeholder home-placeholder-wide" />
          <span className="home-placeholder home-placeholder-medium" />
          <span className="home-placeholder" />
        </div>
      ))}
    </div>
  );
}
export function HomeSkeleton() {
  return (
    <main id="main" className="home-page home-loading" aria-busy="true">
      <p className="sr-only" role="status">
        Loading Westmere Careers
      </p>
      <section className="hero" aria-hidden="true">
        <div className="container">
          <div className="hero-grid">
            <div className="hero-copy home-loading-copy">
              <span className="home-placeholder home-placeholder-medium" />
              <div className="home-loading-title">
                <span className="home-placeholder" />
                <span className="home-placeholder home-placeholder-wide" />
                <span className="home-placeholder home-placeholder-medium" />
              </div>
              <div className="home-loading-description">
                <span className="home-placeholder" />
                <span className="home-placeholder home-placeholder-wide" />
              </div>
              <div className="home-loading-reassurance">
                <span className="home-placeholder" />
                <span className="home-placeholder" />
              </div>
            </div>
            <div className="hero-photograph home-placeholder home-loading-photo" />
          </div>
          <div className="home-loading-search">
            <span className="home-placeholder" />
            <span className="home-placeholder" />
            <span className="home-placeholder" />
          </div>
          <div className="home-loading-pills">
            {[1, 2, 3, 4, 5].map((number) => (
              <span className="home-placeholder" key={number} />
            ))}
          </div>
        </div>
      </section>
      <section className="container human-story" aria-hidden="true">
        <div className="home-placeholder home-loading-story-photo" />
        <div className="home-loading-copy">
          <span className="home-placeholder home-placeholder-medium" />
          <div className="home-loading-subtitle">
            <span className="home-placeholder" />
            <span className="home-placeholder home-placeholder-wide" />
          </div>
          <span className="home-placeholder" />
          <span className="home-placeholder home-placeholder-wide" />
        </div>
      </section>
    </main>
  );
}
