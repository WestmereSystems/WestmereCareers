"use client";
import { useEffect, useState } from "react";
import { UserPlus, UsersRound, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
import { ConfirmAction } from "./confirm-action";
import { DashboardSkeleton } from "./skeleton";
type Invitation = {
  id: string;
  name: string;
  expiresAt: string;
  kind?: "employer" | "agency";
};
type Team = {
  id: string;
  name: string;
  enabled: boolean;
  members: { id: string; email: string; role: string }[];
  pending: { id: string; email: string; expiresAt: string }[];
};
export function BusinessTeam() {
  const session = useSession();
  const [data, setData] = useState<{
    invitations: Invitation[];
    teams: Team[];
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [revoke, setRevoke] = useState<{
    organisationId: string;
    memberId?: string;
    invitationId?: string;
    email: string;
  } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/employers/team", { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!c.signal.aborted) {
          if (r.ok) setData(d);
          else setMessage(d.error);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setMessage("Your team could not be loaded.");
      });
    return () => c.abort();
  }, [session.user?.id, revision]);
  async function invite(
    event: React.FormEvent<HTMLFormElement>,
    organisationId: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email"));
    setBusy(true);
    try {
      const d = await sendJson("/api/employers/team", {
        action: "invite",
        organisationId,
        email,
      });
      setMessage(d.message);
      form.reset();
      setRevision((v) => v + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function accept(
    event: React.FormEvent<HTMLFormElement>,
    invitation: Invitation,
  ) {
    event.preventDefault();
    setBusy(true);
    try {
      // Joining a business is an explicit account change; use the same verified-email, recent-login and Terms checks as onboarding.
      await sendJson("/api/employers/account", {
        kind: session.business?.kind || invitation.kind || "employer",
        tradingName: session.business?.tradingName || invitation.name,
        businessEmail: session.user?.email,
        termsAccepted: true,
      });
      const d = await sendJson("/api/employers/team", {
        action: "accept",
        invitationId: invitation.id,
      });
      setMessage(d.message);
      await session.refresh();
      setRevision((v) => v + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="profile-section-intro">
        <p className="eyebrow">Your hiring team</p>
        <h2>A shared business workspace.</h2>
        <p className="muted">
          The business creator manages access. Accepted members keep access when
          their email changes. Employer Growth and higher plans, and all agency plans, include team access within their seat allowance.
        </p>
      </div>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {!data && !message ? <DashboardSkeleton /> : null}
      {data?.invitations.map((i) => (
        <section className="panel business-team-panel" key={i.id}>
          <h3>Join {i.name}</h3>
          <p>
            Invited as {session.user?.email}. Expires{" "}
            {new Date(i.expiresAt).toLocaleDateString("en-AU")}.
          </p>
          <p>
            Authorised members can manage listings and review private applications within their assigned scope, and
            receive hiring notifications. Joining uses this account as a
            business account.
          </p>
          <form onSubmit={(e) => void accept(e, i)}>
            <label className="consent-row">
              <input type="checkbox" required /> I accept the{" "}
              <Link href="/terms" target="_blank">
                Terms and Conditions
              </Link>{" "}
              for this business account.
            </label>
            <button className="button primary" disabled={busy}>
              Accept invitation
            </button>
          </form>
        </section>
      ))}
      {data?.teams.map((t) => (
        <section className="panel business-team-panel" key={t.id}>
          <h3>
            <UsersRound size={20} aria-hidden="true" /> {t.name}
          </h3>
          {!t.enabled && (
            <p className="notice">
              Invitations and member hiring access require an eligible employer or agency plan. You can revoke access at any time.
            </p>
          )}
          <ul className="business-team-list">
            {t.members.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.email}</strong>
                  <small>
                    {m.role === "owner"
                      ? "Business admin · creator"
                      : "Hiring team member"}
                  </small>
                </div>
                {m.role !== "owner" && (
                  <button
                    className="button secondary small"
                    onClick={() =>
                      setRevoke({
                        organisationId: t.id,
                        memberId: m.id,
                        email: m.email,
                      })
                    }
                  >
                    <Trash2 size={16} aria-hidden="true" /> Revoke access
                  </button>
                )}
              </li>
            ))}
          </ul>
          <h4>Invite an account</h4>
          <form
            className="business-team-invite"
            onSubmit={(e) => void invite(e, t.id)}
          >
            <label className="field-label">
              Email address
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                disabled={!t.enabled || busy}
                placeholder="colleague@example.com"
              />
            </label>
            <button className="button primary" disabled={!t.enabled || busy}>
              <UserPlus size={16} aria-hidden="true" /> Send invitation
            </button>
          </form>
          {t.pending.length > 0 && (
            <>
              <h4>Pending invitations</h4>
              <ul className="business-team-list">
                {t.pending.map((i) => (
                  <li key={i.id}>
                    <div>
                      <strong>{i.email}</strong>
                      <small>
                        Expires{" "}
                        {new Date(i.expiresAt).toLocaleDateString("en-AU")}
                      </small>
                    </div>
                    <button
                      className="button secondary small"
                      onClick={() =>
                        setRevoke({
                          organisationId: t.id,
                          invitationId: i.id,
                          email: i.email,
                        })
                      }
                    >
                      Cancel invitation
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
      {data && !data.invitations.length && !data.teams.length && (
        <div className="panel">
          <h3>
            {session.business
              ? "Your business admin manages your team."
              : "No pending business invitations."}
          </h3>
          <p className="muted">
            Sign in with the email address used for the invitation. Existing
            team membership follows your account, even after an email change.
          </p>
        </div>
      )}
      {revoke && (
        <ConfirmAction
          title={`Revoke access for ${revoke.email}?`}
          confirmLabel="Revoke access"
          onClose={() => setRevoke(null)}
          onConfirm={async () => {
            const { email: _, ...payload } = revoke;
            const d = await sendJson("/api/employers/team", {
              action: "revoke",
              ...payload,
            });
            setMessage(d.message);
            setRevision((v) => v + 1);
          }}
        >
          <p>
            This removes their hiring access and cancels the selected
            invitation. A fresh invitation will be required to join again.
          </p>
        </ConfirmAction>
      )}
    </>
  );
}
