import type { Metadata } from "next";
import { ApplicationStudio } from "@/components/premium-pages";
import { getPublicJob, getPublicJobs } from "@/lib/jobs-server";

export const metadata: Metadata = {
  title: "Application Studio — Careers+",
  description:
    "Bring your experience into focus. Improve your CV or tailor it to the next role you want to apply for.",
};

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string | string[] }>;
}) {
  const { job } = await searchParams;
  const requestedJobId =
    typeof job === "string" && job.length <= 100 ? job : undefined;
  const [inventory, selection] = await Promise.all([
    getPublicJobs(),
    requestedJobId ? getPublicJob(requestedJobId) : Promise.resolve(null),
  ]);
  // A direct role link can target any inventory page. Resolve it independently
  // rather than assuming that the default first page contains the selected role.
  // A live-source failure must never be filled with fictional development roles.
  const source =
    inventory.source === "live" || selection?.source === "live"
      ? "live"
      : "demo";
  const selected = selection?.source === source ? selection.job : null;
  const listed = inventory.source === source ? inventory.jobs : [];
  const jobs = selected
    ? [selected, ...listed.filter((role) => role.id !== selected.id)]
    : listed;
  const initialNotice =
    selection?.error ||
    inventory.error ||
    (requestedJobId && !selected
      ? "The selected role is unavailable. You can choose another role or paste a job description below."
      : undefined);
  return (
    <ApplicationStudio
      key={selected?.id || requestedJobId || "general"}
      jobs={jobs}
      initialJobId={selected?.id}
      initialTailor={Boolean(requestedJobId)}
      initialNotice={initialNotice}
      isDemoInventory={source === "demo"}
    />
  );
}
