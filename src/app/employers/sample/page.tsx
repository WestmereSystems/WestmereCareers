import { SampleWorkspace } from "@/components/sample-workspace";
export const metadata = { title: "Sample hiring workspace" };
export default function Page() {
  return (
    <main id="main" className="container page-main">
      <p className="eyebrow">Explore a more thoughtful hiring journey</p>
      <h1>Your sample hiring workspace.</h1>
      <SampleWorkspace />
    </main>
  );
}
