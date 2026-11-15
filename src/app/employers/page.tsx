import { Check, ArrowRight } from "lucide-react";
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
          <a className="button primary" href="#workspace">
            Your hiring workspace <ArrowRight size={17} />
          </a>
        </div>
        <figure className="employer-hero-photo">
          <img
            src="/images/creative-colleagues.webp"
            alt="Colleagues bringing their experience together at work"
            width={1260}
            height={709}
          />
          <figcaption>Good hiring feels human.</figcaption>
        </figure>
      </section>
      <section className="page-content" id="workspace">
        <EmployerWorkspace />
      </section>
    </main>
  );
}
