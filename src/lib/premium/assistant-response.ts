import { cookies } from "next/headers";
import { z } from "zod";
import {
  assistantIdentity,
  guestCookie,
} from "@/lib/server/assistant-identity";
import { premiumAdmin } from "./providers";
import { premiumError, PremiumError } from "./http";
import type { StudioResult } from "./contracts";
import type { AssistantPreview } from "./assistant-preview";

export function assistantAttemptId(request: Request) {
  const value = request.headers.get("x-westmere-attempt");
  if (!value) return null; // Keep the existing Studio API compatible.
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success)
    throw new PremiumError("INVALID_REQUEST", "Start a new request.");
  return parsed.data;
}

export async function assistantResponse(
  request: Request,
  options: {
    reservation: string;
    paid: boolean;
    userId: string | null;
    principal?: string;
    generate: (
      signal: AbortSignal,
      onPreview?: (preview: AssistantPreview) => void,
    ) => Promise<StudioResult>;
  },
) {
  const admin = premiumAdmin();
  const attempt = assistantAttemptId(request);
  const principal =
    options.principal ??
    (attempt
      ? assistantIdentity(
          (await cookies()).get(guestCookie)?.value,
          options.userId,
          request,
          process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        ).principal
      : "");
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const streaming = Boolean(
    attempt && request.headers.get("accept")?.includes("text/event-stream"),
  );
  let settled = false;
  async function refund() {
    if (!settled)
      await admin.rpc(
        options.paid ? "settle_ai_usage" : "settle_trial_ai_usage",
        options.paid
          ? { p_reservation_id: options.reservation, p_success: false }
          : { p_reservation: options.reservation, p_success: false },
      );
  }
  async function run(emit: (data: object) => void) {
    let timer: ReturnType<typeof setInterval> | undefined;
    let checking = false;
    let generating = true;
    try {
      signal.throwIfAborted();
      if (attempt) {
        const registered = await admin.rpc("register_assistant_attempt", {
          p_attempt: attempt,
          p_principal: principal,
          p_reservation: options.reservation,
          p_paid: options.paid,
          p_user: options.userId,
        });
        if (registered.error || registered.data !== true)
          throw new PremiumError(
            "REQUEST_STOPPED",
            "Request stopped. No completed answer was charged.",
            409,
          );
        // A separate Stop request also works when a hosting proxy keeps the original connection open.
        timer = setInterval(async () => {
          if (checking || signal.aborted) return;
          checking = true;
          try {
            const active = await admin.rpc("assistant_attempt_active", {
              p_attempt: attempt,
              p_principal: principal,
            });
            if (generating && (active.error || active.data !== true))
              abort.abort();
          } catch {
            if (generating) abort.abort();
          } finally {
            checking = false;
          }
        }, 1500);
      }
      emit({ type: "progress", step: "preparing" });
      const result = await options.generate(
        signal,
        streaming ? (preview) => emit({ type: "preview", preview }) : undefined,
      );
      generating = false;
      if (timer) clearInterval(timer);
      signal.throwIfAborted();
      emit({ type: "progress", step: "checking" });
      const completion = attempt
        ? await admin.rpc("complete_assistant_attempt", {
            p_attempt: attempt,
            p_principal: principal,
          })
        : await admin.rpc(
            options.paid ? "settle_ai_usage" : "settle_trial_ai_usage",
            options.paid
              ? { p_reservation_id: options.reservation, p_success: true }
              : { p_reservation: options.reservation, p_success: true },
          );
      if (
        completion.error ||
        ((attempt || !options.paid) && completion.data !== true)
      )
        throw new PremiumError(
          "REQUEST_STOPPED",
          "This answer was not completed. No credit was used.",
          409,
        );
      settled = true;
      return {
        result,
        ...(options.paid ? { reservationId: options.reservation } : {}),
      };
    } finally {
      generating = false;
      if (timer) clearInterval(timer);
      await refund();
    }
  }
  if (!streaming)
    return Response.json(await run(() => {}), {
      headers: { "Cache-Control": "private, no-store" },
    });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (data: object) => {
        if (!signal.aborted)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
      };
      try {
        emit({ type: "progress", step: "received" });
        const data = await run(emit);
        emit({ type: "result", ...data });
      } catch (error) {
        if (!signal.aborted)
          emit({ type: "error", ...(await premiumError(error).json()) });
      } finally {
        try {
          controller.close();
        } catch {
          /* The reader may already have stopped. */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
