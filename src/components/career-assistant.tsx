"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUp,
  Copy,
  Download,
  FileCheck2,
  FilePenLine,
  PanelRightClose,
  RotateCcw,
  PanelLeft,
  Star,
  Square,
  Target,
  Upload,
  X,
  LoaderCircle,
} from "lucide-react";
import {
  cvReadinessScore,
  studioReviewText,
  type StudioRequest,
  type StudioResult,
} from "@/lib/premium/contracts";
import type { Job } from "@/lib/jobs";
import { useSession } from "./providers";
import { useNotice } from "./notices";
import { useAssistantAllowance } from "./assistant-allowance";
import { useAssistantConsent } from "./assistant-consent";
import { ChatHistory, useAssistantChats } from "./assistant-chats";
import { type ChatEntry, type ChatSnapshot } from "@/lib/assistant-chats";
import type { AssistantPreview } from "@/lib/premium/assistant-preview";
import {
  attachmentText,
  attachmentLimitError,
  MAX_ASSISTANT_ATTACHMENTS,
  type AssistantAttachment,
} from "@/lib/assistant-attachments";
export async function extractCv(file: File, signal?: AbortSignal) {
  const body = new FormData();
  body.set("file", file);
  const r = await fetch("/api/assistant/document", {
    method: "POST",
    body,
    signal,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "The document could not be read.");
  return d as { text: string; filename: string; message: string };
}
export function CvScore({ result }: { result: StudioResult }) {
  const review = result.review;
  if (!review) return null;
  const score = cvReadinessScore(review);
  return (
    <section
      className="cv-score-report"
      aria-label="CV document readiness review"
    >
      <div className="score-heading">
        <div>
          <p className="eyebrow">
            CV review · {review.intendedField || "General document review"}
          </p>
          <h3>
            {score === null
              ? "More CV evidence needed"
              : "Your CV, with a clearer direction."}
          </h3>
        </div>
        {score !== null && (
          <strong className="cv-score">
            {score}
            <small>/100</small>
          </strong>
        )}
      </div>
      <p>{review.explanation}</p>
      {review.criteria.map((c) => (
        <div key={c.criterion} className="score-criterion">
          <div>
            <strong>
              {
                {
                  clarity: "Clarity",
                  structure: "Structure",
                  evidence: "Evidence & achievements",
                  skills: "Skills",
                  roleAlignment: "Field alignment",
                }[c.criterion]
              }
            </strong>
            <span>{c.points}/20</span>
          </div>
          <progress max={20} value={c.points} />
          <p>{c.feedback}</p>
        </div>
      ))}
      <p className="fineprint">
        An approximate automated review of this document against five writing
        criteria. It is not an ATS score, a comparison with other applicants or
        a prediction of hiring success. Review suggestions for accuracy.
      </p>
    </section>
  );
}
const tasks = [
  { mode: "review", text: "Review my CV", icon: FileCheck2 },
  { mode: "improve", text: "Improve my CV", icon: FilePenLine },
  { mode: "tailor", text: "Draft a cover letter", icon: Target },
  { mode: "match", text: "Compare with a role", icon: Target },
] as const;
function entry(
  role: ChatEntry["role"],
  text: string,
  result?: StudioResult,
): ChatEntry {
  return { id: crypto.randomUUID(), role, text, ...(result ? { result } : {}) };
}
function FadingText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\s+)/).map((piece, index) => (
        <span className="chat-text-piece" key={index}>
          {piece}
        </span>
      ))}
    </>
  );
}
export function CareerChat({
  job,
  onResult,
  initialMode,
  showHistoryOnDesktop = false,
  onAttachmentsChange,
}: {
  job?: Job;
  onResult?: (result: StudioResult) => void;
  initialMode?: StudioRequest["mode"];
  showHistoryOnDesktop?: boolean;
  onAttachmentsChange?: (attachments: AssistantAttachment[]) => void;
}) {
  const session = useSession(),
    notice = useNotice();
  const { allowance, error, refresh } = useAssistantAllowance();
  const history = useAssistantChats();
  const [category, setCategory] = useState(initialMode);
  const [started, setStarted] = useState(false);
  const categoryUsed = useRef(false);
  const initialDescription = job
    ? [job.description, ...job.requirements, ...job.responsibilities].join("\n")
    : "";
  const [cv, setCv] = useState("");
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [expectsReview, setExpectsReview] = useState(false);
  useEffect(() => {
    onAttachmentsChange?.(attachments);
  }, [attachments, onAttachmentsChange]);
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState(initialDescription);
  const [roleTitle, setRoleTitle] = useState(job?.title || "");
  const [consent, setConsent] = useAssistantConsent(session.user?.id);
  const [consentReminder, setConsentReminder] = useState(false);
  const [consentBanner, setConsentBanner] = useState(0);
  useEffect(() => {
    if (!consentBanner) return;
    const timeout = window.setTimeout(() => setConsentBanner(0), 6500);
    return () => window.clearTimeout(timeout);
  }, [consentBanner]);
  useEffect(() => {
    if (consent) {
      setConsentReminder(false);
      setConsentBanner(0);
    }
  }, [consent]);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [phase, setPhase] = useState("received");
  const [filename, setFilename] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const entriesRef = useRef<ChatEntry[]>([]);
  const [preview, setPreview] = useState<AssistantPreview | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (showHistoryOnDesktop && window.matchMedia("(min-width: 900px)").matches)
      setHistoryOpen(true);
  }, [showHistoryOnDesktop]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useRef<{ id: string; exists: boolean } | null>(null);
  const unsaved = useRef<ChatSnapshot | null>(null);
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const attempt = useRef<string | null>(null);
  const owner = useRef(session.user?.id);
  const log = useRef<HTMLDivElement>(null);
  const lastUser = useRef<HTMLDivElement>(null);
  const userTurns = entries.filter((item) => item.role === "user").length;
  useEffect(() => {
    // Anchor once per submitted turn. Incoming tokens never force the reader down.
    const container = log.current,
      prompt = lastUser.current;
    if (container && prompt) {
      container.scrollTo({
        top:
          prompt.getBoundingClientRect().top -
          container.getBoundingClientRect().top +
          container.scrollTop -
          18,
        behavior: "auto",
      });
      const bounds = prompt.getBoundingClientRect();
      if (bounds.top < 100 || bounds.bottom > window.innerHeight - 40)
        container.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
    } else container?.scrollTo({ top: 0, behavior: "auto" });
  }, [userTurns, activeId]);
  useEffect(() => {
    if (owner.current !== session.user?.id) {
      request.current?.abort();
      request.current = null;
      attempt.current = null;
      entriesRef.current = [];
      setEntries([]);
      setCv("");
      setAttachments([]);
      setUploadError("");
      setFilename("");
      setGoal("");
      setConsentReminder(false);
      setConsentBanner(0);
      setBusy(false);
      setPreview(null);
      setStarted(false);
      categoryUsed.current = false;
      setCategory(initialMode);
      setDescription(initialDescription);
      setRoleTitle(job?.title || "");
      active.current = null;
      setActiveId(null);
      unsaved.current = null;
      setSaveError("");
      setSaving(false);
      setHistoryBusy(false);
    }
    owner.current = session.user?.id;
  }, [session.user?.id, initialMode, initialDescription, job?.title]);
  useEffect(() => () => request.current?.abort(), []);
  function replaceEntries(next: ChatEntry[]) {
    entriesRef.current = next;
    setEntries(next);
  }
  function snapshot(
    next = entriesRef.current,
    overrides: Partial<ChatSnapshot> = {},
  ): ChatSnapshot {
    return {
      entries: next,
      cv,
      filename,
      attachments,
      description,
      jobTitle: roleTitle,
      ...overrides,
    };
  }
  async function persist(value: ChatSnapshot) {
    if (!session.isPremium || !session.user) return true;
    const userId = session.user.id;
    if (!active.current)
      active.current = { id: crypto.randomUUID(), exists: false };
    const chat = active.current;
    unsaved.current = value;
    setSaving(true);
    try {
      await history.save(chat.id, value, chat.exists);
      if (owner.current !== userId) return false;
      chat.exists = true;
      setActiveId(chat.id);
      unsaved.current = null;
      setSaveError("");
      window.dispatchEvent(new Event("westmere-chats-change"));
      return true;
    } catch (cause) {
      if (owner.current === userId)
        setSaveError(
          cause instanceof Error
            ? cause.message
            : "Your chat could not be saved. Retry saving before leaving.",
        );
      return false;
    } finally {
      if (owner.current === userId) setSaving(false);
    }
  }
  function answer(text: string) {
    const next = [...entriesRef.current, entry("assistant", text)];
    replaceEntries(next);
    return next;
  }
  function editDraft(
    entryId: string,
    field: "revisedCv" | "coverLetter",
    value: string,
  ) {
    const next = entriesRef.current.map((item) =>
      item.id === entryId && item.result
        ? { ...item, result: { ...item.result, [field]: value } }
        : item,
    );
    replaceEntries(next);
    void persist(snapshot(next));
  }
  function newChat() {
    if (busy || historyBusy || saving || saveError) return;
    replaceEntries([]);
    setCv("");
    setAttachments([]);
    setUploadError("");
    setFilename("");
    setGoal("");
    setConsentReminder(false);
    setStarted(false);
    setCategory(initialMode);
    categoryUsed.current = false;
    setDescription(initialDescription);
    setRoleTitle(job?.title || "");
    setPreview(null);
    active.current = null;
    setActiveId(null);
    unsaved.current = null;
  }
  async function openChat(chatId: string) {
    if (busy || historyBusy || saving || saveError) return;
    const userId = owner.current;
    setHistoryBusy(true);
    try {
      const saved = await history.load(chatId);
      if (owner.current !== userId) return;
      active.current = { id: chatId, exists: true };
      setActiveId(chatId);
      replaceEntries(saved.entries);
      setCv(saved.cv);
      setAttachments(
        saved.attachments ||
          (saved.cv
            ? [
                {
                  id: crypto.randomUUID(),
                  filename: saved.filename || "Saved document",
                  text: saved.cv,
                },
              ]
            : []),
      );
      setUploadError("");
      setFilename(saved.filename);
      setDescription(saved.description);
      setRoleTitle(saved.jobTitle || "");
      setGoal("");
      setConsentReminder(false);
      categoryUsed.current = saved.entries.some((item) => item.role === "user");
      setStarted(categoryUsed.current);
      setCategory(undefined);
      setPreview(null);
      unsaved.current = null;
      setSaveError("");
    } catch (cause) {
      notice({
        title: "Open conversation",
        message: cause instanceof Error ? cause.message : "Try again.",
      });
    } finally {
      if (owner.current === userId) setHistoryBusy(false);
    }
  }
  async function deleteChat(chatId: string) {
    const userId = owner.current;
    setHistoryBusy(true);
    try {
      await history.remove(chatId);
      if (owner.current !== userId) return;
      if (active.current?.id === chatId) {
        active.current = null;
        setActiveId(null);
        unsaved.current = null;
        setSaveError("");
        replaceEntries([]);
        setCv("");
        setAttachments([]);
        setUploadError("");
        setFilename("");
        setGoal("");
        setConsentReminder(false);
        setStarted(false);
        setCategory(initialMode);
        categoryUsed.current = false;
        setDescription(initialDescription);
        setRoleTitle(job?.title || "");
      }
      window.dispatchEvent(new Event("westmere-chats-change"));
    } catch (cause) {
      notice({
        title: "Delete conversation",
        message: cause instanceof Error ? cause.message : "Try again.",
      });
    } finally {
      if (owner.current === userId) setHistoryBusy(false);
    }
  }
  async function upload(files: File[]) {
    if (request.current || historyBusy || saving) return;
    setUploadError("");
    if (attachments.length + files.length > MAX_ASSISTANT_ATTACHMENTS) {
      setUploadError(
        "Attach up to 10 documents. Remove one before adding another.",
      );
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    attempt.current = null;
    setBusy(true);
    setPhase("uploading");
    setConsentReminder(false);
    let next = [...attachments];
    try {
      for (const file of files) {
        const data = await extractCv(file, controller.signal);
        if (controller.signal.aborted) return;
        const candidate = [
          ...next,
          { id: crypto.randomUUID(), filename: data.filename, text: data.text },
        ];
        const error = attachmentLimitError(candidate);
        if (error) throw Error(error);
        next = candidate;
        setAttachments(next);
        setCv(attachmentText(next));
        setFilename(next[0]?.filename || "");
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setUploadError(
          cause instanceof Error
            ? cause.message
            : "The document could not be read. Try again.",
        );
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
        if (active.current?.exists)
          await persist(
            snapshot(entriesRef.current, {
              attachments: next,
              cv: attachmentText(next),
              filename: next[0]?.filename || "",
            }),
          );
      }
    }
  }
  function removeAttachment(attachmentId: string) {
    if (busy || historyBusy || saving) return;
    const next = attachments.filter((file) => file.id !== attachmentId);
    setAttachments(next);
    setCv(attachmentText(next));
    setFilename(next[0]?.filename || "");
    setConsentReminder(false);
    setUploadError("");
    if (active.current?.exists)
      void persist(
        snapshot(entriesRef.current, {
          attachments: next,
          cv: attachmentText(next),
          filename: next[0]?.filename || "",
        }),
      );
  }
  async function stop() {
    const current = request.current;
    if (!current || stopping) return;
    setStopping(true);
    if (phase === "uploading") {
      current.abort();
      request.current = null;
      setBusy(false);
      setStopping(false);
      setUploadError("Upload stopped.");
      return;
    }
    try {
      if (attempt.current) {
        const response = await fetch("/api/assistant/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId: attempt.current }),
        });
        const data = await response.json();
        if (!response.ok)
          throw Error(
            data.error || "Stopping could not be confirmed. Try Stop again.",
          );
        if (data.status === "completed") {
          setPhase("checking");
          return;
        }
      }
      current.abort();
      request.current = null;
      attempt.current = null;
      setBusy(false);
      setPreview(null);
      const next = answer(
        "Stopped. No completed answer was generated and no credit was used. You can edit your request and try again.",
      );
      if (active.current?.exists) await persist(snapshot(next));
      await refresh();
    } catch (cause) {
      answer(cause instanceof Error ? cause.message : "Try Stop again.");
    } finally {
      setStopping(false);
    }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (
      request.current ||
      busy ||
      historyBusy ||
      saving ||
      saveError ||
      session.loading ||
      (!goal.trim() && !attachments.length)
    )
      return;
    const selected = !categoryUsed.current
      ? tasks.find((task) => task.mode === category)
      : undefined;
    const text =
      goal.trim() ||
      selected?.text ||
      (attachments.length
        ? "Please review the attached documents and suggest useful next steps."
        : undefined);
    if (!text) return;
    if (!consent) {
      setConsentReminder(true);
      setConsentBanner(Date.now());
      return;
    }
    setStarted(true);
    if (!allowance || allowance.remaining === 0) {
      answer(
        error ||
          (!allowance
            ? "Your allowance is loading. Please try again shortly."
            : session.user
              ? "Your available requests are used. Check Billing for your renewal date or explore Careers+."
              : "Your guest request is used. Sign in for your account allowance."),
      );
      if (allowance?.remaining === 0 && !session.user) session.openAuth();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setPhase("received");
    setExpectsReview(
      selected?.mode === "review" ||
        /(?:review|assess|score).*(?:cv|resume)|(?:cv|resume).*(?:review|assess|score)/i.test(
          text,
        ),
    );
    setPreview(null);
    // Reserve a saved-chat slot before spending a request. Existing chats can continue at the cap.
    if (
      session.isPremium &&
      !active.current?.exists &&
      !(await persist(snapshot()))
    ) {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
      return;
    }
    if (controller.signal.aborted) return;
    const prompt = selected
      ? `Prompt Category: ${selected.text}\n\n${text}`
      : text;
    const recent = entriesRef.current;
    const next = [
      ...recent,
      {
        ...entry("user", prompt),
        ...(attachments.length
          ? {
              attachments: attachments.map(({ id, filename }) => ({
                id,
                filename,
              })),
            }
          : {}),
      },
    ];
    replaceEntries(next);
    categoryUsed.current = true;
    setGoal("");
    setConsentReminder(false);
    if (session.isPremium) await persist(snapshot(next));
    if (controller.signal.aborted) return;
    const attemptId = crypto.randomUUID();
    attempt.current = attemptId;
    try {
      const response = await fetch(
        session.isPremium ? "/api/studio" : "/api/assistant",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "X-Westmere-Attempt": attemptId,
          },
          signal: controller.signal,
          body: JSON.stringify({
            mode: "chat",
            cv,
            goals: prompt,
            consent: true,
            conversation: recent.slice(-8).map((item) => ({
              role: item.role,
              text: [
                item.text,
                item.result?.revisedCv,
                item.result?.coverLetter,
                ...(item.result?.improvements || []),
              ]
                .filter(Boolean)
                .join("\n\n")
                .slice(0, 2000),
            })),
            ...(description.trim()
              ? { jobDescription: description, jobTitle: roleTitle }
              : {}),
          }),
        },
      );
      if (!response.ok) {
        const data = await response.json();
        throw Error(data.error || "Your request could not be completed.");
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw Error("The response connection was interrupted. Try again.");
      const decoder = new TextDecoder();
      let buffer = "",
        completed = false;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";
          for (const raw of events) {
            const line = raw
              .split("\n")
              .find((value) => value.startsWith("data: "));
            if (!line) continue;
            const data = JSON.parse(line.slice(6));
            if (controller.signal.aborted) return;
            if (data.type === "progress") setPhase(data.step);
            if (data.type === "preview") setPreview(data.preview);
            if (data.type === "error")
              throw Error(
                data.error ||
                  "Your request did not complete. No credit was used.",
              );
            if (data.type === "result") {
              completed = true;
              setPreview(null);
              const updated = [
                ...entriesRef.current,
                entry("assistant", data.result.summary, data.result),
              ];
              replaceEntries(updated);
              onResult?.(data.result);
              await persist(snapshot(updated));
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (!completed && !controller.signal.aborted)
        throw Error(
          "The response ended before an answer was ready. Your allowance will be returned.",
        );
    } catch (cause) {
      if (!controller.signal.aborted) {
        setPreview(null);
        await persist(
          snapshot(
            answer(
              cause instanceof Error ? cause.message : "Please try again.",
            ),
          ),
        );
      }
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
        attempt.current = null;
        await refresh();
      }
    }
  }
  const locked = busy || historyBusy || saving;
  const hasPreview = Boolean(
    preview?.summary ||
    preview?.improvements?.length ||
    preview?.revisedCv ||
    preview?.coverLetter,
  );
  const lastUserIndex = entries.findLastIndex((item) => item.role === "user");
  return (
    <div className="career-chat">
      <div className="chat-toolbar">
        <button
          type="button"
          className="text-button"
          aria-expanded={historyOpen}
          aria-controls={`${id}-chats`}
          onClick={() => {
            setHistoryOpen(!historyOpen);
            if (!historyOpen) void history.refresh();
          }}
        >
          <PanelLeft size={17} />
          Chats
        </button>
        <span className="chat-save-status" role="status">
          {saving
            ? "Saving…"
            : activeId && !saveError
              ? "Saved to your account"
              : session.isPremium
                ? "Saves with your first message"
                : "Page session"}
        </span>
        <button
          type="button"
          className="text-button"
          title="Start a fresh conversation"
          disabled={locked || Boolean(saveError)}
          onClick={newChat}
        >
          <RotateCcw size={16} />
          New chat
        </button>
      </div>
      <div className="chat-workspace">
        {historyOpen && (
          <ChatHistory
            id={`${id}-chats`}
            chats={history.chats}
            activeId={activeId}
            busy={locked}
            unsaved={Boolean(saveError)}
            loading={history.loading}
            error={history.error}
            premium={session.isPremium}
            onClose={() => setHistoryOpen(false)}
            onNew={newChat}
            onSelect={(chatId) => void openChat(chatId)}
            onDelete={(chatId) => void deleteChat(chatId)}
            onRetry={() => void history.refresh()}
          />
        )}
        <div className="chat-main">
          <div
            className="chat-log dot-surface"
            ref={log}
            role="log"
            aria-label="Career preparation conversation"
            aria-live="polite"
            aria-busy={busy && phase !== "uploading"}
          >
            {!started && (
              <div className="chat-bubble assistant-bubble chat-welcome">
                <span className="chat-avatar">
                  <Star size={19} aria-hidden="true" />
                </span>
                <p>Hi, I’m the Westmere Assistant. What’s your next step?</p>
                <p className="muted">
                  Ask a career question, upload a document or choose an optional
                  starting point. Follow-up questions are welcome.
                </p>
              </div>
            )}
            {!started && (
              <div className="chat-task-buttons">
                {tasks.map((task) => (
                  <button
                    type="button"
                    aria-pressed={category === task.mode}
                    disabled={locked}
                    key={task.mode}
                    onClick={() => {
                      setCategory(
                        category === task.mode ? undefined : task.mode,
                      );
                    }}
                  >
                    <task.icon size={17} aria-hidden="true" />
                    {task.text}
                  </button>
                ))}
              </div>
            )}
            {entries.map((item, index) => (
              <div
                key={item.id}
                ref={index === lastUserIndex ? lastUser : undefined}
                className={`chat-bubble ${item.role === "user" ? "user-bubble" : "assistant-bubble"}`}
              >
                {item.role === "assistant" && (
                  <Star
                    size={16}
                    className="chat-entry-star"
                    aria-hidden="true"
                  />
                )}
                <p className="chat-message-text">{item.text}</p>
                {item.attachments?.length ? (
                  <ul className="chat-sent-attachments">
                    {item.attachments.map((file) => (
                      <li key={file.id}>
                        <FileCheck2 size={14} aria-hidden="true" />
                        {file.filename}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {item.result && (
                  <>
                    <CvScore result={item.result} />
                    {item.result.improvements.length > 0 && (
                      <ul>
                        {item.result.improvements.map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                    )}
                    {(["revisedCv", "coverLetter"] as const).map((field) =>
                      item.result?.[field] ? (
                        <label
                          key={field}
                          className="field-label chat-editable-draft"
                          htmlFor={`${item.id}-${field}`}
                        >
                          {field === "revisedCv"
                            ? "Review and edit your CV draft"
                            : "Review and edit your cover letter"}
                          <textarea
                            id={`${item.id}-${field}`}
                            defaultValue={item.result[field]}
                            maxLength={field === "revisedCv" ? 35000 : 8000}
                            disabled={busy || saving}
                            onBlur={(event) => {
                              if (event.target.value !== item.result?.[field])
                                editDraft(item.id, field, event.target.value);
                            }}
                          />
                        </label>
                      ) : null,
                    )}
                    {item.result.matchedSkills.length > 0 && (
                      <>
                        <h3 className="chat-result-heading">
                          Requirements evidenced in your CV
                        </h3>
                        <ul>
                          {item.result.matchedSkills.map((skill, index) => (
                            <li key={index}>{skill}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {item.result.missingSkills.length > 0 && (
                      <>
                        <h3 className="chat-result-heading">
                          Requirements not yet evidenced
                        </h3>
                        <ul>
                          {item.result.missingSkills.map((skill, index) => (
                            <li key={index}>{skill}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <div className="chat-result-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              [
                                studioReviewText(item.result!),
                                item.result!.revisedCv,
                                item.result!.coverLetter,
                              ]
                                .filter(Boolean)
                                .join("\n\n"),
                            );
                            notice({
                              title: "Response copied",
                              message: "Check every fact before using it.",
                            });
                          } catch {
                            notice({
                              title: "Copy response",
                              message: "Select and copy the text above.",
                            });
                          }
                        }}
                      >
                        <Copy size={15} />
                        Copy response
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          const content = [
                            studioReviewText(item.result!),
                            item.result!.revisedCv,
                            item.result!.coverLetter,
                          ]
                            .filter(Boolean)
                            .join("\n\n");
                          const url = URL.createObjectURL(
                            new Blob([content], {
                              type: "text/plain;charset=utf-8",
                            }),
                          );
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = "westmere-response.txt";
                          link.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download size={15} aria-hidden="true" />
                        Download .txt
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {busy && phase !== "uploading" && (
              <div
                className="chat-bubble assistant-bubble chat-stream"
                aria-live="off"
              >
                <Star
                  size={16}
                  className="chat-entry-star"
                  aria-hidden="true"
                />
                {hasPreview ? (
                  <>
                    <p className="chat-generation-status" role="status">
                      <LoaderCircle
                        size={15}
                        className="spin"
                        aria-hidden="true"
                      />
                      {expectsReview || preview?.reviewPending
                        ? "Preparing your CV review and score…"
                        : phase === "checking"
                          ? "Checking your response…"
                          : "Generating your response…"}
                    </p>
                    <p className="chat-message-text">
                      <FadingText text={preview?.summary || ""} />
                    </p>
                    {preview?.improvements?.length ? (
                      <ul>
                        {preview.improvements.map((text, index) => (
                          <li key={index}>
                            <FadingText text={text} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {preview?.revisedCv && (
                      <div className="chat-draft">
                        <FadingText text={preview.revisedCv} />
                      </div>
                    )}
                    {preview?.coverLetter && (
                      <div className="chat-draft">
                        <FadingText text={preview.coverLetter} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="chat-thinking" role="status">
                    {phase === "uploading"
                      ? "Reading your document"
                      : phase === "checking"
                        ? "Finishing your response"
                        : "Thinking"}
                    <span aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                )}
                {(expectsReview || preview?.reviewPending) && (
                  <div className="chat-review-pending" role="status">
                    <span className="skeleton-line" aria-hidden="true" />
                    <span>
                      Preparing the review criteria and score. They will appear
                      when the review is complete.
                    </span>
                  </div>
                )}
              </div>
            )}
            {historyBusy && <p role="status">Opening your conversation…</p>}
          </div>
          <form className="chat-composer" onSubmit={send}>
            {consentBanner > 0 && (
              <div className="chat-consent-banner" role="alert">
                <span>
                  Your message hasn’t been sent. Tick the sharing agreement
                  below, then choose Send.
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Dismiss sharing reminder"
                  onClick={() => setConsentBanner(0)}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="chat-upload-row">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt"
                multiple
                hidden
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  if (files.length) void upload(files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className="button secondary small assistant-upload"
                disabled={
                  locked || attachments.length >= MAX_ASSISTANT_ATTACHMENTS
                }
                onClick={() => {
                  fileRef.current?.click();
                }}
              >
                <Upload size={16} />
                Upload document
              </button>
            </div>
            <p className="chat-attachment">
              PDF, DOCX or TXT · {attachments.length}/10 documents · 24,000
              extracted characters in total
            </p>
            <ul
              className="chat-attachment-list"
              aria-label="Attached documents"
            >
              {attachments.map((file) => (
                <li key={file.id}>
                  <FileCheck2 size={17} aria-hidden="true" />
                  <span>
                    {file.filename}
                    <small>Ready to send</small>
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${file.filename}`}
                    disabled={locked}
                    onClick={() => removeAttachment(file.id)}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
            {busy && phase === "uploading" && (
              <p className="chat-upload-status" role="status">
                <LoaderCircle size={15} className="spin" aria-hidden="true" />{" "}
                Reading document text. Choose Send when you are ready.
              </p>
            )}
            {uploadError && (
              <p role="alert" className="chat-upload-error">
                {uploadError}
              </p>
            )}
            <details
              className="chat-source"
              open={
                (!started && (category === "tailor" || category === "match")) ||
                undefined
              }
            >
              <summary>Role description · optional</summary>
              <label className="field-label">
                Job description
                <textarea
                  maxLength={16000}
                  value={description}
                  disabled={locked}
                  onChange={(event) => {
                    setDescription(event.target.value);
                  }}
                />
              </label>
            </details>
            <label className="sr-only" htmlFor={`${id}-goal`}>
              Your message or follow-up instructions
            </label>
            <div className="chat-input">
              <textarea
                id={`${id}-goal`}
                placeholder="Ask about your next step…"
                maxLength={1900}
                value={goal}
                disabled={locked}
                onChange={(event) => {
                  setGoal(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              {busy ? (
                <button
                  type="button"
                  className="icon-button chat-stop"
                  aria-label="Stop generating"
                  disabled={stopping}
                  onClick={() => void stop()}
                >
                  <Square size={18} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="icon-button chat-send"
                  aria-label="Send career request"
                  disabled={
                    session.loading ||
                    locked ||
                    Boolean(saveError) ||
                    (!goal.trim() && !attachments.length)
                  }
                >
                  <ArrowUp size={21} />
                </button>
              )}
            </div>
            <label className="checkbox-label assistant-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={locked}
                onChange={(event) => {
                  setConsent(event.target.checked);
                  if (event.target.checked) setConsentReminder(false);
                }}
              />
              <span>
                I agree to send my message, attached document text and recent
                chat to OpenAI for the requests I choose to send. Remember this
                choice on this browser; I can uncheck it at any time. I’ll
                remove unnecessary sensitive details and check the answer.
              </span>
            </label>
            {consentReminder && (
              <p className="chat-consent-reminder" role="status">
                Your message hasn’t been sent. Tick the sharing agreement to
                allow your message and document text to be processed.
              </p>
            )}
            {saveError && (
              <p className="chat-save-error" role="alert">
                {saveError}{" "}
                <button
                  type="button"
                  className="text-button"
                  disabled={locked}
                  onClick={() => {
                    if (unsaved.current) void persist(unsaved.current);
                  }}
                >
                  Retry saving
                </button>
              </p>
            )}
            <p className="fineprint">
              {allowance
                ? `${allowance.remaining} of ${allowance.cap} requests available · ${allowance.tier}`
                : error || "Loading your allowance…"}
              . Only completed answers use a credit.{" "}
              {session.isPremium
                ? "Up to 10 chats, including attached document text, save to your account. Manage or delete them in Chats."
                : "This chat stays in this page session. Careers+ can save up to 10 chats."}{" "}
              <Link href="/privacy">Your privacy</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
export function CareerAssistant({ job }: { job?: Job }) {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    try {
      setClosed(sessionStorage.getItem("westmere-assistant-closed") === "1");
    } catch {}
  }, []);
  function toggleClosed() {
    setClosed((previous) => {
      try {
        sessionStorage.setItem(
          "westmere-assistant-closed",
          previous ? "0" : "1",
        );
      } catch {}
      return !previous;
    });
  }
  return (
    <aside
      className={`career-assistant ${closed ? "assistant-is-collapsed" : ""}`}
      id="career-assistant"
      aria-label="Westmere Assistant"
    >
      <div className="assistant-heading dot-surface">
        <span>
          <Star size={19} />
          {!closed && "Westmere Assistant"}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={
            closed ? "Open Westmere Assistant" : "Close Westmere Assistant"
          }
          aria-expanded={!closed}
          onClick={toggleClosed}
        >
          {closed ? <Star size={21} /> : <PanelRightClose size={19} />}
        </button>
      </div>
      <div hidden={closed}>
        <CareerChat job={job} />
      </div>
    </aside>
  );
}
