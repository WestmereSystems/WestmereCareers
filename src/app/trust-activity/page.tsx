import { TrustActivity } from "@/components/trust-workflows";
export const metadata = { title: "My trust activity" };
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <div className="page-intro">
        <p className="eyebrow">Clarity, with care</p>
        <h1>Your trust activity.</h1>
        <p>Follow private reports, corrections and review outcomes.</p>
      </div>
      <TrustActivity />
    </main>
  );
}
