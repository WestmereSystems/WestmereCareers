import { EmployerWorkspace } from "@/components/employer-workspace";
export const metadata = { title: "Your hiring workspace" };
export default function Page() {
  return (
    <main id="main" className="container page-main">
      <p className="eyebrow">Clear opportunities. Thoughtful conversations.</p>
      <h1>Your hiring workspace.</h1>
      <EmployerWorkspace />
    </main>
  );
}
