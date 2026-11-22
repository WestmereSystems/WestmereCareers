import { Check, X, Clock3 } from "lucide-react";
export function VerificationProgress({ status }: { status: string }) {
  const approved = status === "approved",
    rejected = status === "rejected",
    decided = approved || rejected;
  const current = decided ? 2 : 1;
  const labels = [
    "Submitted",
    status === "needs_information" ? "More information needed" : "Under review",
    approved ? "Approved" : rejected ? "Not approved" : "Decision",
  ];
  return (
    <ol
      className={`verification-progress ${approved ? "is-approved" : rejected ? "is-rejected" : "is-pending"}`}
      aria-label="Business verification progress"
    >
      {labels.map((label, index) => (
        <li
          key={index}
          className={
            index < current || approved
              ? "complete"
              : index === current
                ? "current"
                : "upcoming"
          }
          aria-current={index === current ? "step" : undefined}
        >
          <span className="verification-step-icon" aria-hidden="true">
            {index === 2 && rejected ? (
              <X size={19} />
            ) : index < current || approved ? (
              <Check size={19} />
            ) : index === current ? (
              <Clock3 size={18} />
            ) : (
              index + 1
            )}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
