import { findPlace } from "@/lib/locations";
import { ApiError } from "@/lib/server/http";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
import { savedSearchFilterCount } from "@/lib/saved-search-filters";
const fields =
  "id,name,keyword,location,work_modes,employment_types,min_salary,direct_only,distance,listed_within,listed_from,listed_to,alerts_enabled,frequency,consent_at,next_run_at,created_at,updated_at";
const input = z
  .object({
    id: z.uuid().nullable().optional(),
    name: z.string().trim().min(2).max(100),
    filters: z
      .object({
        keyword: z.string().max(120).default(""),
        location: z.string().max(120).default(""),
        workMode: z
          .array(z.enum(["On-site", "Hybrid", "Remote"]))
          .max(3)
          .default([]),
        employmentType: z
          .array(z.enum(["Full time", "Part time", "Contract", "Casual"]))
          .max(4)
          .default([]),
        minSalary: z.number().min(0).max(1000000).nullable().optional(),
        directOnly: z.boolean().default(false),
        distance: z
          .number()
          .refine((v) => [5, 10, 25, 50, 100, 250].includes(v))
          .nullable()
          .optional(),
        listedWithin: z
          .number()
          .refine((v) => [1, 3, 7, 14, 30, 40].includes(v))
          .nullable()
          .optional(),
        listedFrom: z.iso.date().nullable().optional(),
        listedTo: z.iso.date().nullable().optional(),
      })
      .strict(),
    alertsEnabled: z.boolean(),
    frequency: z.enum(["daily", "weekly"]),
    consent: z.boolean().default(false),
  })
  .strict();
export async function GET(request: Request) {
  try {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(new URL(request.url).searchParams.get("emailPage") || 1);
    const { supabase, user } = await requireSession();
    const [searches, status, preview] = await Promise.all([
      supabase
        .from("saved_searches")
        .select(fields)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.rpc("my_alert_activity", { p_page: page }),
      supabase.rpc("my_preview_available_at"),
    ]);
    checkRpc(searches.error);
    checkRpc(status.error);
    checkRpc(preview.error);
    return json({
      searches: searches.data,
      ...status.data,
      previewAvailableAt: preview.data,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(request, input, 6000);
    const { supabase } = await requireSession();
    if (
      (!b.id || b.alertsEnabled) &&
      savedSearchFilterCount(b.filters as import("@/lib/search").JobFilters) < 2
    )
      throw new ApiError(
        400,
        "Choose at least two specific filters before saving your search.",
      );
    const place = b.filters.distance ? findPlace(b.filters.location) : null;
    if (b.filters.distance && !place)
      throw new ApiError(
        400,
        "Choose a city or town with its state for the distance filter.",
      );
    const { data, error } = await supabase.rpc("save_search", {
      p_id: b.id ?? null,
      p_name: b.name,
      p_filters: {
        ...b.filters,
        ...(place
          ? { centreLat: place.latitude, centreLon: place.longitude }
          : {}),
      },
      p_alerts: b.alertsEnabled,
      p_frequency: b.frequency,
      p_consent: b.consent,
    });
    checkRpc(error);
    return json({
      id: data,
      message: b.alertsEnabled
        ? "Search saved. Email alerts are enabled for your verified account address."
        : "Search saved. Email alerts are paused.",
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(
      request,
      z.object({ id: z.uuid() }).strict(),
      1000,
    );
    const { supabase } = await requireSession();
    const { error } = await supabase.rpc("remove_saved_search", { p_id: b.id });
    checkRpc(error);
    return json({
      message: "Saved search removed and queued alerts canceled.",
    });
  } catch (error) {
    return apiError(error);
  }
}
