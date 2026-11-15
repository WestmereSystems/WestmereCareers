export type HiringRole = {
  id: string;
  title: string;
  organisation_id: string;
  status: string;
  published_at: string | null;
  expires_at: string | null;
};
export type HiringApplication = {
  id: string;
  job_id: string;
  status: string;
  created_at: string;
  application_events: { event_type: string; occurred_at: string }[];
};
export const hiringStages = [
  { id: "received", label: "Received" },
  { id: "opened", label: "Opened" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "not_proceeding", label: "Not proceeding" },
] as const;
const day = 86_400_000;
const average = (values: number[]) =>
  values.length
    ? Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
      ) / 10
    : null;
const firstEvent = (
  application: HiringApplication,
  types: string[],
  now: number,
) => {
  const submitted = Date.parse(application.created_at);
  const dates = application.application_events
    .filter((event) => types.includes(event.event_type))
    .map((event) => Date.parse(event.occurred_at))
    .filter((date) => date >= submitted && date <= now);
  return dates.length ? Math.min(...dates) : null;
};

/** Non-identifying, cohort-based aggregates. Opening this dashboard records no application views. */
export function summariseHiring(
  roles: HiringRole[],
  applications: HiringApplication[],
  days: number,
  now = Date.now(),
) {
  const from = now - days * day;
  const current = applications.filter((application) => {
    const created = Date.parse(application.created_at);
    return created >= from && created <= now;
  });
  const previous = applications.filter((application) => {
    const created = Date.parse(application.created_at);
    return created >= from - days * day && created < from;
  });
  const reviews = current.flatMap((application) => {
    const date = firstEvent(application, ["opened"], now);
    return date === null
      ? []
      : [(date - Date.parse(application.created_at)) / day];
  });
  const responses = current.flatMap((application) => {
    const date = firstEvent(application, ["employer_update", "decision"], now);
    return date === null
      ? []
      : [(date - Date.parse(application.created_at)) / day];
  });
  const awaiting = current.filter(
    (application) =>
      application.status === "received" &&
      firstEvent(application, ["opened"], now) === null,
  );
  const stages = hiringStages.map((stage) => ({
    ...stage,
    count: current.filter((application) => application.status === stage.id)
      .length,
  }));
  const buckets = 8;
  const bucketSize = (days * day) / buckets;
  const trend = Array.from({ length: buckets }, (_, index) => {
    const start = from + index * bucketSize;
    const end = start + bucketSize;
    return {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      count: current.filter((application) => {
        const date = Date.parse(application.created_at);
        return (
          date >= start && (index === buckets - 1 ? date <= end : date < end)
        );
      }).length,
    };
  });
  const byRole = roles
    .map((role) => {
      const cohort = current.filter(
        (application) => application.job_id === role.id,
      );
      const opened = cohort.filter(
        (application) => firstEvent(application, ["opened"], now) !== null,
      ).length;
      return {
        id: role.id,
        title: role.title,
        status: role.status,
        applications: cohort.length,
        opened,
        awaiting: cohort.filter(
          (application) =>
            application.status === "received" &&
            firstEvent(application, ["opened"], now) === null,
        ).length,
        shortlisted: cohort.filter(
          (application) => application.status === "shortlisted",
        ).length,
        interviews: cohort.filter(
          (application) => application.status === "interview",
        ).length,
        offers: cohort.filter((application) => application.status === "offer")
          .length,
      };
    })
    .sort(
      (a, b) =>
        b.applications - a.applications || a.title.localeCompare(b.title),
    );
  return {
    days,
    from: new Date(from).toISOString(),
    through: new Date(now).toISOString(),
    openRoles: roles.filter(
      (role) =>
        role.status === "published" &&
        role.published_at &&
        Date.parse(role.published_at) <= now &&
        (!role.expires_at || Date.parse(role.expires_at) > now),
    ).length,
    draftRoles: roles.filter((role) => role.status === "draft").length,
    closedRoles: roles.filter(
      (role) =>
        role.status === "closed" ||
        (role.status === "published" &&
          role.expires_at &&
          Date.parse(role.expires_at) <= now),
    ).length,
    totalApplications: current.length,
    previousApplications: previous.length,
    reviewed: reviews.length,
    awaitingReview: awaiting.length,
    awaitingOverSevenDays: awaiting.filter(
      (application) => Date.parse(application.created_at) <= now - 7 * day,
    ).length,
    reviewRate: current.length
      ? Math.round((reviews.length / current.length) * 100)
      : null,
    averageFirstReviewDays: average(reviews),
    averageFirstResponseDays: average(responses),
    responseSample: responses.length,
    offers: stages.find((stage) => stage.id === "offer")!.count,
    stages,
    trend,
    byRole,
  };
}
export type HiringStatistics = ReturnType<typeof summariseHiring>;
