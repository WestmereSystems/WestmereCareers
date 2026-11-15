import { Notifications } from "@/components/profile-tools";
export const metadata = { title: "Notifications" };
export default function Page() {
  return (
    <main id="main" className="container page-main">
      <p className="eyebrow">A little more clarity</p>
      <h1>Your notifications.</h1>
      <Notifications />
    </main>
  );
}
