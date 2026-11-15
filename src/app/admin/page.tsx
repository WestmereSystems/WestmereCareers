import { ModerationWorkspace } from "@/components/moderation-workspace";
export const metadata = {
  title: "Trust review workspace",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <div className="page-intro">
        <p className="eyebrow">Westmere trust & safety</p>
        <h1>A considered review.</h1>
        <p>Independent decisions, clear feedback and an accountable audit.</p>
      </div>
      <ModerationWorkspace />
    </main>
  );
}
