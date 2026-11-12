export const metadata = { title: "Your privacy" };
export default function Privacy() {
  return (
    <main id="main" className="container legal">
      <div className="page-intro">
        <p className="eyebrow">Your information, your choice</p>
        <h1>Keep your next chapter yours.</h1>
        <p className="muted">
          Development privacy information · Updated 12 November 2026
        </p>
      </div>
      <p>
        This development preview uses fictional job listings and employers.
        Account, payment and AI services remain unavailable until their
        dedicated service configuration is completed. A final privacy policy
        identifying the operating entity, privacy contact and all service
        providers is required before public launch.
      </p>
      <h2>Your CV</h2>
      <p>
        The CV editor keeps pasted text in the current page’s memory. It does
        not save CV text to browser storage. If you deliberately save a profile
        after sign-in, the CV is stored privately in the configured database.
        Submitting a live application creates a separate snapshot shared with
        the hiring organisation.
      </p>
      <h2>OpenAI assistance is your choice</h2>
      <p>
        Paid CV improvement and tailoring send your CV, optional goals and
        selected role information to OpenAI only after explicit consent and a
        request for assistance. Requests are made by the server using a private
        key and configured with storage disabled. Provider processing and
        retention terms still apply; this setting is not a promise of zero
        retention.
      </p>
      <p>
        A labelled static sample does not send your entered CV to OpenAI.
        Skill-overlap matching is a separate, explainable calculation; it does
        not predict a hiring outcome.
      </p>
      <h2>Account and payment information</h2>
      <p>
        Supabase provides configured sign-in and private account storage. Stripe
        hosts payment collection and subscription management; Westmere does not
        collect card details directly. Live purchases are not enabled in this
        preview.
      </p>
      <h2>On your device</h2>
      <p>
        We store your selected appearance and saved job identifiers in local
        browser storage. Session cookies support sign-in when configured. We
        have not added advertising trackers or third-party behavioural
        analytics.
      </p>
      <h2>Before live personal data is accepted</h2>
      <p>
        The operating entity must publish contact details, collection purposes,
        overseas service processing, retention periods, rights of access and
        correction, export and deletion procedures, and a complaint process.
        Account export/deletion and the full retention workflow remain launch
        gates. Please use sample or redacted CV text while reviewing development
        functionality.
      </p>
    </main>
  );
}
