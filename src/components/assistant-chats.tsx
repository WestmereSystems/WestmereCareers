"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, PanelLeftClose, RotateCcw, Trash2 } from "lucide-react";
import {
  chatSnapshotSchema,
  chatTitle,
  MAX_SAVED_CHATS,
  type ChatSnapshot,
  type SavedChat,
} from "@/lib/assistant-chats";
import { useSession } from "./providers";

export function useAssistantChats() {
  const session = useSession();
  const [chats, setChats] = useState<SavedChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const owner = useRef(session.user?.id);
  owner.current = session.user?.id;
  const refresh = useCallback(async () => {
    const userId = session.user?.id;
    if (!userId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/assistant/chats", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (owner.current === userId) {
        setChats(data.chats);
        setError("");
      }
    } catch (cause) {
      if (owner.current === userId)
        setError(
          cause instanceof Error
            ? cause.message
            : "Your chats could not be loaded.",
        );
    } finally {
      if (owner.current === userId) setLoading(false);
    }
  }, [session.user?.id, Boolean(session.business)]);
  useEffect(() => {
    setChats([]);
    setLoading(false);
    setError("");
    void refresh();
    const changed = () => void refresh();
    window.addEventListener("westmere-chats-change", changed);
    return () => window.removeEventListener("westmere-chats-change", changed);
  }, [refresh]);
  async function save(id: string, snapshot: ChatSnapshot, existing: boolean) {
    const userId = owner.current;
    const body = { title: chatTitle(snapshot.entries), snapshot };
    const response = await fetch(
      `/api/assistant/chats${existing ? `/${id}` : ""}`,
      {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existing ? body : { id, ...body }),
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw Error(data.error || "This conversation could not be saved.");
    if (owner.current !== userId)
      throw new DOMException("Account changed", "AbortError");
    setChats((current) =>
      [data.chat, ...current.filter((chat) => chat.id !== id)].slice(
        0,
        MAX_SAVED_CHATS,
      ),
    );
    return data.chat as SavedChat;
  }
  async function load(id: string) {
    const response = await fetch(`/api/assistant/chats/${id}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(data.error || "This conversation could not be opened.");
    return chatSnapshotSchema.parse(data.chat.snapshot);
  }
  async function remove(id: string) {
    const userId = owner.current;
    const response = await fetch(`/api/assistant/chats/${id}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(data.error || "This conversation could not be deleted.");
    if (owner.current === userId)
      setChats((current) => current.filter((chat) => chat.id !== id));
  }
  return { chats, loading, error, refresh, save, load, remove };
}

export function ChatHistory({
  chats,
  activeId,
  busy,
  unsaved,
  loading,
  error,
  premium,
  onClose,
  onNew,
  onSelect,
  onDelete,
  onRetry,
  id,
}: {
  chats: SavedChat[];
  activeId: string | null;
  busy: boolean;
  unsaved: boolean;
  loading: boolean;
  error: string;
  premium: boolean;
  id: string;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <aside
      className="chat-history"
      id={id}
      aria-label="Saved conversations"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="chat-history-heading">
        <strong>Your chats</strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Close chats menu"
          onClick={onClose}
        >
          <PanelLeftClose size={18} />
        </button>
      </div>
      <button
        type="button"
        className="button secondary small chat-new"
        disabled={busy || unsaved}
        onClick={onNew}
      >
        <RotateCcw size={16} />
        New chat
      </button>
      <p className="fineprint">
        {chats.length} of {MAX_SAVED_CHATS} saved chats
      </p>
      {loading && <p role="status">Loading your chats…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" className="text-button" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      <nav aria-label="Conversations">
        <ul>
          {chats.map((chat) => (
            <li key={chat.id}>
              <button
                type="button"
                className="chat-history-item"
                aria-current={activeId === chat.id ? "page" : undefined}
                disabled={busy || unsaved}
                onClick={() => onSelect(chat.id)}
              >
                <MessageSquare size={15} aria-hidden="true" />
                <span>
                  {chat.title}
                  <small>
                    {new Date(chat.updated_at).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    })}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="icon-button chat-delete"
                aria-label={`Delete chat: ${chat.title}`}
                title="Delete chat"
                disabled={busy}
                onClick={() => onDelete(chat.id)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {!loading && !error && !chats.length && (
        <p className="muted">Your saved conversations will appear here.</p>
      )}
      <p className="fineprint">
        {premium ? (
          "Conversations and attached document text save to your account. Delete any chat at any time."
        ) : (
          <>
            With <Link href="/careers-plus">Careers+</Link>, save up to 10 chats
            and return to them on any device.
          </>
        )}
      </p>
    </aside>
  );
}
