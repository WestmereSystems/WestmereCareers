"use client";

import Link from "next/link";
import { RoleStrength } from "./role-strength";
import type { AssistantAttachment } from "@/lib/assistant-attachments";
import { CareerChat } from "./career-assistant";
import { useNotice, individualNotice, foundingCareersNotice } from "./notices";
import { AnimatedArt } from "./animated-art";
import { Suspense, useEffect, useRef, useState } from "react";
import { redirect, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FilePenLine,
  Layers3,
  Leaf,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
} from "lucide-react";
import { useSession } from "@/components/providers";
import type { Job } from "@/lib/jobs";

async function billingRedirect(
  endpoint: "checkout" | "portal",
  signal: AbortSignal,
) {
  const response = await fetch(`/api/billing/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal,
  });
  const data = await response.json();
  if (signal.aborted) return;
  if (!response.ok)
    throw new Error(
      data.error || "Billing is temporarily unavailable. Please try again.",
    );
  if (typeof data.url !== "string")
    throw new Error("Billing is temporarily unavailable. Please try again.");
  const destination = new URL(data.url);
  if (
    destination.protocol !== "https:" ||
    !(
      destination.hostname === "stripe.com" ||
      destination.hostname.endsWith(".stripe.com")
    )
  )
    throw new Error(
      "The billing destination could not be verified. Please try again later.",
    );
  window.location.assign(destination.href);
}

export function CareersPlus() {
  const session = useSession();
  if (
    !session.loading &&
    session.user &&
    session.isPremium &&
    session.marketplaceOpen
  )
    redirect("/studio");
  return <CareersPlusContent key={session.user?.id ?? "signedout"} />;
}
function CheckoutNotice({
  onMessage,
  onComplete,
}: {
  onMessage: (value: string) => void;
  onComplete: (value: boolean) => void;
}) {
  const status = useSearchParams().get("checkout");
  const session = useSession();
  useEffect(() => {
    onComplete(status === "complete");
    if (status === "complete") {
      onMessage(
        "Thanks for completing Checkout. Your access appears here once your subscription is confirmed.",
      );
      void session.refresh();
    } else if (status === "canceled")
      onMessage(
        "Checkout was closed. You can continue exploring Westmere for free.",
      );
  }, [status, session.refresh, onMessage, onComplete]);
  return null;
}
function CareersPlusContent() {
  const session = useSession();
  const notify = useNotice();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const billingRequest = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      billingRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!session.loading && !session.marketplaceOpen)
      notify(foundingCareersNotice);
  }, [session.loading, session.marketplaceOpen, notify]);
  async function billing(kind: "checkout" | "portal") {
    if (!session.marketplaceOpen) {
      notify(foundingCareersNotice);
      return;
    }
    if (session.business) {
      notify(individualNotice);
      return;
    }
    if (billingRequest.current) return;
    if (!session.configured) {
      setMessage(
        "Subscriptions are being prepared. You can explore the Studio while we finish connecting the service.",
      );
      return;
    }
    if (!session.user) {
      session.openAuth();
      return;
    }
    const controller = new AbortController();
    billingRequest.current = controller;
    setBusy(true);
    setMessage("");
    try {
      await billingRedirect(kind, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "Billing is temporarily unavailable.",
        );
    } finally {
      if (!controller.signal.aborted) {
        billingRequest.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <main id="main">
      <Suspense fallback={null}>
        <CheckoutNotice
          onMessage={setMessage}
          onComplete={setCheckoutComplete}
        />
      </Suspense>
      <section className="pricing-hero container premium-hero-grid">
        <div className="premium-hero-copy">
          <div className="plus-wordmark">
            <Sparkles size={19} aria-hidden="true" />
            Careers<span>+</span>
          </div>
          <p className="eyebrow">A studio for your next chapter</p>
          <h1>
            Your experience.
            <br />A little more possibility.
          </h1>
          <p>
            You’ve done the work. Bring your strengths into the light with
            thoughtful CV guidance and applications that sound like you.
          </p>
          <div className="actions-row">
            <a className="button purple" href="#careers-plus-plan">
              Explore Careers+ · A$25/month <ArrowRight size={18} />
            </a>
            <Link className="text-link" href="/studio">
              Look inside the studio →
            </Link>
          </div>
          <p className="fineprint">
            Cancel online. Your CV stays private until you choose to use a
            connected feature.
          </p>
        </div>
        <AnimatedArt variant="premium" />
      </section>
      <section className="container human-story premium-human-story">
        <figure className="people-photo">
          <img
            src="/images/laptop-work.webp"
            alt="A man working on a laptop beside a bright window"
            width="1920"
            height="1280"
            loading="lazy"
          />
        </figure>
        <div>
          <p className="eyebrow">Make room for your next move</p>
          <h2>
            You bring the experience.
            <br />
            We help you find the words.
          </h2>
          <p>
            Bring your PDF or Word CV into your private profile. In the studio,
            choose when to get suggestions, tailor an application or explore
            roles with skills that match your experience.
          </p>
          <Link className="text-link" href="/account">
            Build your private CV library →
          </Link>
        </div>
      </section>
      <div className="container pricing-grid" id="careers-plus-plan">
        <section
          aria-label="What Careers+ helps you do"
          className="feature-list"
        >
          <article className="feature-item">
            <span
              className="round-icon"
              style={{
                flexShrink: 0,
                background: "var(--lilac)",
                color: "var(--purple)",
              }}
            >
              <FilePenLine size={23} />
            </span>
            <div>
              <h3>Find the clearest way to say it.</h3>
              <p>
                Get personal suggestions for your CV’s structure, wording and
                emphasis. Build on the experience you already have, without
                adding claims you can’t support.
              </p>
            </div>
          </article>
          <article className="feature-item">
            <span
              className="round-icon"
              style={{
                flexShrink: 0,
                background: "var(--lilac)",
                color: "var(--purple)",
              }}
            >
              <Target size={23} />
            </span>
            <div>
              <h3>A thoughtful application for this role.</h3>
              <p>
                Bring a job description into the studio. Tailor your CV and
                draft a cover letter around relevant evidence, then review and
                edit every word before using it.
              </p>
            </div>
          </article>
          <article className="feature-item">
            <span
              className="round-icon"
              style={{
                flexShrink: 0,
                background: "var(--lilac)",
                color: "var(--purple)",
              }}
            >
              <Layers3 size={23} />
            </span>
            <div>
              <h3>A clearer starting point for your search.</h3>
              <p>
                Filter roles by skills evidenced in your CV. See what matches,
                keep the reasoning in view and explore roles that make sense for
                your next step.
              </p>
            </div>
          </article>
          <div
            className="notice"
            style={{ display: "flex", alignItems: "start", gap: 12 }}
          >
            <ShieldCheck
              size={22}
              style={{ flexShrink: 0, color: "var(--primary)" }}
            />
            <p>
              Your CV stays in the editor until you choose to use a connected
              feature. You decide when to share it with OpenAI, and you remain
              in control of what you apply with.
            </p>
          </div>
        </section>
        <aside className="price-card">
          <span className="badge purple">
            <Sparkles size={13} />
            Your Careers+ Studio
          </span>
          <div className="price-value">
            A$25<span> / month</span>
          </div>
          <p className="fineprint">
            Billed monthly. Renews monthly until canceled.
            <br />
            GST is not currently charged. No annual commitment.
          </p>
          <ul className="check-list">
            <li>
              <Check />
              100 Assistant requests per billing month
            </li>
            <li>
              <Check />
              General improvements and role-specific tailoring
            </li>
            <li>
              <Check />
              Editable CV and cover letter drafts
            </li>
            <li>
              <Check />
              CV skill-match filters while you browse
            </li>
            <li>
              <Check />
              Copy and download your reviewed text
            </li>
            <li>
              <Check />
              Cancel online through Manage billing
            </li>
          </ul>
          {session.isPremium ? (
            <Link href="/studio" className="button purple">
              Open your studio
              <ArrowRight size={17} />
            </Link>
          ) : (
            <button
              className="button purple"
              disabled={busy}
              onClick={() => void billing("checkout")}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Sparkles size={17} />
              )}
              Start Careers+
              <ArrowRight size={17} />
            </button>
          )}
          <Link href="/studio" className="button secondary">
            Open the Studio
            <ArrowUpRight size={16} />
          </Link>
          {session.user && (
            <button
              className="text-button"
              style={{ marginTop: 16 }}
              disabled={busy}
              onClick={() => void billing("portal")}
            >
              Manage billing
            </button>
          )}
          <p className="fineprint">
            Search, applications and employer response insights stay free.
            Careers+ supports your preparation; it does not buy hiring priority
            or guarantee interviews.
          </p>
          {message && (
            <div className="message" role="status">
              {message}
              {checkoutComplete && !session.isPremium && (
                <button
                  type="button"
                  className="text-button"
                  style={{ display: "flex", gap: 6, marginTop: 10 }}
                  onClick={() => void session.refresh()}
                >
                  <RefreshCw size={13} />
                  Check subscription again
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
      <section className="container" style={{ paddingBottom: 65 }}>
        <div
          className="panel"
          style={{
            display: "flex",
            gap: 22,
            alignItems: "center",
            flexWrap: "wrap",
            background: "var(--soft)",
          }}
        >
          <Leaf size={30} color="var(--primary)" style={{ flexShrink: 0 }} />
          <div style={{ flex: "1 1 290px" }}>
            <h2 style={{ fontSize: 24, marginBottom: 8 }}>
              A little support for your next chapter.
            </h2>
            <p className="fineprint">
              Every suggestion is a starting point. Keep your voice, check the
              facts and choose what feels right for the work you want.
            </p>
          </div>
          <Link href="/jobs" className="button secondary">
            Keep exploring roles
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}

type StudioProps = {
  jobs: Job[];
  initialJobId?: string;
  isDemoInventory: boolean;
  initialTailor?: boolean;
  initialNotice?: string;
};

export function ApplicationStudio(props: StudioProps) {
  const session = useSession();
  return <StudioEditor key={session.user?.id || "guest"} {...props} />;
}

function StudioEditor({
  jobs,
  initialJobId,
  isDemoInventory,
  initialTailor = false,
  initialNotice,
}: StudioProps) {
  const session = useSession();
  const jobId = initialJobId || "";
  const [documents, setDocuments] = useState<AssistantAttachment[]>([]);
  return (
    <main id="main" className="studio-page">
      <section className="page-intro container studio-intro">
        <p className="eyebrow">Your next chapter, in your words</p>
        <h1>
          {session.user && session.isPremium
            ? "Your Careers+ Studio."
            : "Westmere Assistant."}
        </h1>
        <p className="muted">
          A space for your CV, cover letters and career questions.
        </p>
      </section>
      <div className="container page-content">
        <div className="studio-workspace">
          <section
            className="studio-chat-panel panel"
            aria-label="Careers+ Studio conversation workspace"
          >
            <h2>
              <Star size={22} aria-hidden="true" />
              Westmere Assistant
            </h2>
            {initialNotice && (
              <p className="notice" role="status">
                {initialNotice}
              </p>
            )}
            {isDemoInventory && (
              <p className="demo-note">
                Example roles are fictional. Your documents remain private.
              </p>
            )}
            {!session.isPremium && (
              <p className="notice">
                Every signed-in account includes three free Assistant requests,
                including employer and agency accounts. Only completed answers
                use a request. Paid access includes 100 requests per billing
                period and up to 10 saved chats.
                {session.business && (
                  <>
                    {" "}
                    Enterprise access belongs to its billing owner; invited
                    accounts retain their own free allowance.{" "}
                    <Link href="/account?tab=billing">
                      Review business plans
                    </Link>
                  </>
                )}
              </p>
            )}
            <CareerChat
              key={jobId}
              job={jobs.find((job) => job.id === jobId)}
              initialMode={jobId || initialTailor ? "tailor" : undefined}
              showHistoryOnDesktop
              onAttachmentsChange={setDocuments}
            />
          </section>
        </div>
        <RoleStrength documents={documents} />
        <p className="fineprint studio-privacy-note">
          Your conversations are private. Your CV isn’t used to make your
          profile publicly searchable. Applying to an employer is always a
          separate choice.
        </p>
      </div>
    </main>
  );
}
