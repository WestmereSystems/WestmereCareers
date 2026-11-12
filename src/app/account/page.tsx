import { Account } from "@/components/candidate-pages";
export const metadata = {
  title: "My account",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="container">
      <div className="page-intro">
        <p className="eyebrow">Your own little corner</p>
        <h1>Make yourself at home.</h1>
      </div>
      <div className="page-content">
        <Account />
      </div>
    </main>
  );
}
