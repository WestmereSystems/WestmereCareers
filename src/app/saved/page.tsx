import { getPublicJobsByIds } from "@/lib/jobs-server";
import { SavedRoles } from "@/components/candidate-pages";
export const metadata = { title: "Saved roles" };
export default async function Saved() {
  const { source } = await getPublicJobsByIds([]);
  return (
    <main id="main" className="container">
      <div className="page-intro">
        <p className="eyebrow">A few possibilities worth keeping</p>
        <h1>Your saved roles.</h1>
      </div>
      <div className="page-content">
        <SavedRoles source={source} />
      </div>
    </main>
  );
}
