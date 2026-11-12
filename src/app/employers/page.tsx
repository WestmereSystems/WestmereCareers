import { Check, MessageCircle, FileText, ShieldCheck } from "lucide-react";
import { EmployerWorkspace } from "@/components/employer-workspace";
export const metadata = { title: "For employers" };
export default function Employers() {
  return (
    <main id="main" className="container">
      <section className="employer-hero">
        <div>
          <p className="eyebrow">Good teams start with good people</p>
          <h1>
            Find your people.
            <br />
            Build your next chapter.
          </h1>
          <p>
            Bring your opportunity to a more thoughtful Australian job market.
            Clear roles, useful applications, and a human approach to hiring.
          </p>
          <ul className="check-list">
            <li>
              <Check />
              Salary clarity from the first impression.
            </li>
            <li>
              <Check />A simple workspace for reviewing applications.
            </li>
            <li>
              <Check />
              Candidate communication built into the process.
            </li>
          </ul>
        </div>
        <img
          src="/illustrations/growing-together.svg"
          alt="Plants growing together, an illustration of shared opportunity"
          width={420}
          height={340}
        />
      </section>
      <section className="page-content" id="workspace">
        <EmployerWorkspace />
      </section>
    </main>
  );
}
