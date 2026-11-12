import { Applications } from "@/components/candidate-pages";
export const metadata = {
  title: "My applications",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="container">
      <div className="page-intro">
        <p className="eyebrow">A little less wondering</p>
        <h1>Your applications, clearly.</h1>
        <p className="muted">
          A timeline of what’s happened, and what you know so far.
        </p>
      </div>
      <div className="page-content">
        <Applications />
      </div>
    </main>
  );
}
