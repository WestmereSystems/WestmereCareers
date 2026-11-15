"use client";
import { useState } from "react";
export function ContactEmail({
  email,
  label = "Contact the hiring team",
}: {
  email: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="contact-email">
      {open ? (
        <a className="text-link" href={`mailto:${email}`}>
          {email}
        </a>
      ) : (
        <button
          className="text-button"
          type="button"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          {label} · reveal email
        </button>
      )}
      <p className="fineprint">
        For role enquiries. Apply through the listing to keep your application
        in your timeline.
      </p>
    </div>
  );
}
