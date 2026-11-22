import Link from "next/link";
import { Building2, Check, FileText, ShieldCheck } from "lucide-react";
import { HomeHero } from "@/components/home-hero";
import { LaunchPlanOptions } from "./launch-plans";
import { LaunchAssistantAccess } from "./launch-assistant-access";
import { LaunchUpdateForm } from "./launch-update-form";

export function FoundingHome() {
  return (
    <main id="main" className="home-page founding-home">
      <HomeHero
        image="/images/cafe-team.webp"
        imageAlt="Colleagues working together around a laptop"
      >
        <div className="launch-hero-actions panel">
          <div>
            <p className="eyebrow">Australia-wide founding launch</p>
            <p>
              Register your business or agency, complete verification and
              prepare your profile and vacancies privately before public launch.
            </p>
          </div>
          <div className="hero-actions">
            <Link href="/launch/register" className="button primary">
              Register your business
            </Link>
            <Link href="/launch/employers" className="button secondary">
              How employer onboarding works
            </Link>
            <a href="#plans" className="text-link">
              View employer and agency plans
            </a>
          </div>
        </div>
        <p className="fineprint launch-hero-note">
          Free registration · No card required · Your business details and
          vacancies are not public yet
        </p>
      </HomeHero>
      <section
        className="container founding-benefits"
        aria-label="Prepare for Westmere’s launch"
      >
        {[
          [
            Building2,
            "Make yourself at home",
            "Create an employer or agency account and submit the usual business verification form.",
          ],
          [
            FileText,
            "Prepare at your own pace",
            "Build your profile and draft vacancies. Prepare genuine vacancies for independent review before publication.",
          ],
          [
            ShieldCheck,
            "Private until public launch",
            "Business details and vacancies are not public. Verification and subscriptions do not publish your content.",
          ],
        ].map(([Icon, title, body]) => {
          const I = Icon as typeof Building2;
          return (
            <article className="panel" key={String(title)}>
              <I size={26} />
              <h2>{String(title)}</h2>
              <p>{String(body)}</p>
            </article>
          );
        })}
      </section>
      <section className="container founding-story">
        <div>
          <p className="eyebrow">Across Australia, built together</p>
          <h2>Be ready for the beginning.</h2>
          <p>
            We’re focusing on administration, reception, executive support,
            accounts support, customer service and project coordination. Our
            first employer and agency accounts are preparing ahead of the public
            marketplace opening.
          </p>
          <p>
            Use Westmere alongside your existing hiring channels. Public job
            browsing and the employer directory will open at launch;
            applications are not being collected for private vacancies.
          </p>
          <Link href="/launch/employers" className="text-link">
            How registration works →
          </Link>
        </div>
        <div className="panel">
          <h2>Your workspace. Your choice.</h2>
          <p>
            Registration does not start a subscription. After business
            verification, you can review the available employer or agency plans
            in Billing and choose whether to subscribe.
          </p>
          <p>
            During the founding phase, your business profile and vacancies
            remain private. You can record publication permission in Launch
            preparation; Westmere reviews and releases content separately after
            the public marketplace opens.
          </p>
          <div className="hero-actions">
            <Link href="/launch/plans" className="button secondary">
              Explore employer and agency plans
            </Link>
          </div>
          <p className="fineprint">
            Questions?{" "}
            <a href="mailto:hello@westmere.com.au">hello@westmere.com.au</a>
          </p>
        </div>
      </section>
      <section
        className="container founding-home-plans"
        aria-labelledby="plans-title"
      >
        <p className="eyebrow">Optional employer and agency subscriptions</p>
        <h2 id="plans-title">Explore your options before joining.</h2>
        <p className="founding-lead">
          Compare plans below, register for free and complete business
          verification. Subscribing is optional and does not make your profile
          or vacancies public.
        </p>
        <LaunchPlanOptions />
      </section>
      <section className="container founding-candidate" id="candidate-updates">
        <div>
          <p className="eyebrow">Looking for your next role?</p>
          <h2>Be here for the beginning.</h2>
          <p>
            Request an email update when opportunities open across Australia. No
            account or CV is required.
          </p>
        </div>
        <LaunchUpdateForm />
      </section>
    </main>
  );
}

export function FoundingEmployerPage() {
  return (
    <main id="main" className="container page-content founding-page">
      <section className="page-intro">
        <p className="eyebrow">For employers and agencies</p>
        <h1>Prepare your next opportunity.</h1>
        <p className="founding-lead">
          Register for Westmere’s Australia-wide founding launch and get your
          business ready before the public marketplace opens.
        </p>
        <div className="hero-actions">
          <Link href="/launch/register" className="button primary">
            Register your business
          </Link>
          <Link
            href="/launch/register?kind=agency"
            className="button secondary"
          >
            Register your agency
          </Link>
        </div>
      </section>
      <div className="founding-story">
        <section className="panel">
          <h2>A clear path to launch.</h2>
          <ol>
            <li>
              Register with your business email and accept the business Terms.
            </li>
            <li>Sign in and submit the verification form in your account.</li>
            <li>
              After verification, prepare your business profile and vacancies
              privately.
            </li>
            <li>
              Review optional subscriptions in Billing and record content
              permission in Launch preparation.
            </li>
          </ol>
          <p>
            Agency identity, hiring authority and client permissions follow the
            usual independent review process.
          </p>
          <Link href="/launch/employers" className="text-link">
            How employer onboarding works →
          </Link>
        </section>
        <section className="panel">
          <h2>Your content is not public yet.</h2>
          <ul className="check-list">
            <li>
              <Check /> Business profiles and vacancies remain private during
              founding onboarding.
            </li>
            <li>
              <Check /> Verification does not publish a profile or vacancy.
            </li>
            <li>
              <Check /> Subscribing does not bypass verification or publication
              controls.
            </li>
            <li>
              <Check /> Public release requires your permission and Westmere’s
              review after launch opens.
            </li>
          </ul>
          <p className="fineprint">
            Free registration does not start a subscription. Verified employers
            and agencies can choose a paid monthly subscription. Your final
            amount and renewal terms are shown in checkout.
          </p>
          <Link href="/launch/plans" className="text-link">
            Compare employer and agency plans →
          </Link>
          <br />
          <Link href="/launch/sign-in" className="text-link">
            Already registered? Sign in →
          </Link>
        </section>
      </div>
    </main>
  );
}

export function LaunchHoldingPage({ careers = false }: { careers?: boolean }) {
  return (
    <main id="main" className="container page-content founding-page">
      <p className="eyebrow">Westmere’s Australia-wide founding launch</p>
      <h1>
        {careers
          ? "A little more confidence for your next chapter."
          : "Your next opportunity is taking shape."}
      </h1>
      <p className="founding-lead">
        {careers
          ? "Careers+ brings together CV guidance, cover-letter preparation and role comparison. Public access will open when the service is ready."
          : "We’re preparing our first collection of office and professional-support opportunities with participating employers."}
      </p>
      <div className="hero-actions">
        <Link className="button primary" href="/launch#candidate-updates">
          Get a launch update
        </Link>
        <Link className="button secondary" href="/launch/employers">
          How employer onboarding works
        </Link>
      </div>
      {careers && <LaunchAssistantAccess />}
      <p>
        Employer or recruitment agency?{" "}
        <Link href="/launch/register">Register and prepare for launch</Link>.
      </p>
    </main>
  );
}
