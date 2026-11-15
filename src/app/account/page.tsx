import { Suspense } from "react";
import { ProfileHub } from "@/components/profile-hub";
import { getPublicJobsByIds } from "@/lib/jobs-server";
export const metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const { source } = await getPublicJobsByIds([]);
  return (
    <Suspense
      fallback={
        <main id="main" className="container page-content">
          <p role="status">Loading your profile…</p>
        </main>
      }
    >
      <ProfileHub source={source} />
    </Suspense>
  );
}
