import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarPlus, ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/design-system/components/Button";
import { Input } from "@/design-system/components/Input";
import { supabase } from "@/integrations/supabase/external-client";
import { CopilotPanel } from "@/showcase/copilot/CopilotPanel";
import { CATEGORIES } from "@/showcase/discovery/categories";
import { useAuth } from "@/showcase/auth/auth-context";
import { rememberReturnTo } from "@/showcase/saved/saved-events-store";

type EventType = "free" | "paid";
type TierDraft = { key: string; name: string; price: string; quantity: string };
type FormValues = {
  title: string;
  summary: string;
  description: string;
  category: string;
  eventType: EventType;
  startsAt: string;
  endsAt: string;
  venueName: string;
  address: string;
  city: string;
  capacity: string;
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const INITIAL_VALUES: FormValues = {
  title: "",
  summary: "",
  description: "",
  category: "",
  eventType: "free",
  startsAt: "",
  endsAt: "",
  venueName: "",
  address: "",
  city: "",
  capacity: "",
};

const initialTier = (): TierDraft => ({
  key: crypto.randomUUID(),
  name: "",
  price: "",
  quantity: "",
});

const toLocalInputValue = (iso: string): string => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export const Route = createFileRoute("/app/create-event")({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => ({
    edit: typeof search.edit === "string" && search.edit.length > 0 ? search.edit : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Create your event — Outrazo" },
      { name: "description", content: "Create and publish an event on Outrazo." },
      { property: "og:title", content: "Create your event — Outrazo" },
      { property: "og:description", content: "Create and publish an event on Outrazo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreateEventPage,
});

function CreateEventPage() {
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const isEditing = editId !== undefined;
  const { session, profile, displayName, loading: authLoading } = useAuth();
  const [values, setValues] = useState(INITIAL_VALUES);
  const [tiers, setTiers] = useState<TierDraft[]>(() => [initialTier()]);
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(Boolean(editId));
  const [editError, setEditError] = useState<string | null>(null);
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || session) return;
    rememberReturnTo(editId ? `/app/create-event?edit=${editId}` : "/app/create-event");
    void navigate({ to: "/login", replace: true });
  }, [authLoading, editId, navigate, session]);

  useEffect(() => {
    if (!cover) {
      setCoverPreview(savedImageUrl);
      return;
    }
    const preview = URL.createObjectURL(cover);
    setCoverPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [cover, savedImageUrl]);

  useEffect(() => {
    if (!editId || !session) return;
    let active = true;
    setEditLoading(true);
    setEditError(null);
    void (async () => {
      try {
        const { data: row, error: rowError } = await supabase
          .from("events")
          .select("*")
          .eq("id", editId)
          .maybeSingle();
        if (rowError) throw new Error(rowError.message);
        if (!row || row.created_by !== session.user.id) {
          throw new Error("This event couldn't be loaded. It may not exist, may belong to another account, or the organizer dashboard database update may not be applied yet.");
        }
        const { data: tierRows, error: tierError } = await supabase
          .from("event_ticket_tiers")
          .select("*")
          .eq("event_id", row.id)
          .order("price", { ascending: true });
        if (tierError) throw new Error(tierError.message);
        if (!active) return;
        setValues({
          title: row.title ?? "",
          summary: row.summary ?? "",
          description: row.description ?? "",
          category: row.category ?? "",
          eventType: row.event_type === "paid" ? "paid" : "free",
          startsAt: row.starts_at ? toLocalInputValue(row.starts_at) : "",
          endsAt: row.ends_at ? toLocalInputValue(row.ends_at) : "",
          venueName: row.venue_name ?? "",
          address: row.address ?? "",
          city: row.city ?? "",
          capacity: row.capacity === null || row.capacity === undefined ? "" : String(row.capacity),
        });
        setTiers(tierRows.length > 0
          ? tierRows.map((tier) => ({
              key: crypto.randomUUID(),
              name: tier.name ?? "",
              price: tier.price === null || tier.price === undefined ? "" : String(tier.price),
              quantity: tier.quantity === null || tier.quantity === undefined ? "" : String(tier.quantity),
            }))
          : [initialTier()]);
        setDraftId(row.id);
        setSavedImageUrl(row.image_url ?? null);
      } catch (caught: unknown) {
        if (!active) return;
        setEditError(caught instanceof Error ? caught.message : "Could not load this event for editing.");
      } finally {
        if (active) setEditLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [editId, session]);

  const minDateTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }, []);

  const update = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setSuccess(null);
  };

  const applyCopilot = (fields: { title: string; summary: string; description: string; category: string }) => {
    // Only Apply may change form fields, and only these four. Tags are
    // display-only because the database has no tags column. Save-success
    // messages are left untouched.
    setValues((current) => ({ ...current, ...fields }));
    setErrors((current) => ({ ...current, title: "", summary: "", description: "", category: "" }));
  };

  const selectCover = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    setRequestError(null);
    setSuccess(null);
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setErrors((current) => ({ ...current, cover: "Choose a JPG, PNG, or WebP image." }));
      event.currentTarget.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setErrors((current) => ({ ...current, cover: "Image must be 5 MB or smaller." }));
      event.currentTarget.value = "";
      return;
    }
    setErrors((current) => ({ ...current, cover: "" }));
    setCover(file);
  };

  const validate = (intent: "draft" | "publish") => {
    const next: Record<string, string> = {};
    const required = [
      ["title", "Event title"],
      ["summary", "Short summary"],
      ["description", "Full description"],
      ["category", "Category"],
      ["startsAt", "Start date and time"],
      ["endsAt", "End date and time"],
      ["venueName", "Venue name"],
      ["address", "Street address"],
      ["city", "City"],
      ["capacity", "Ticket capacity"],
    ] as const;

    required.forEach(([field, label]) => {
      if (!values[field].trim()) next[field] = `${label} is required.`;
    });
    if (!cover && !savedImageUrl) next.cover = "Upload an event cover image.";

    const start = values.startsAt ? new Date(values.startsAt) : null;
    const end = values.endsAt ? new Date(values.endsAt) : null;
    if (start && !Number.isFinite(start.getTime())) next.startsAt = "Enter a valid start date and time.";
    else if (start && !isEditing && start.getTime() <= Date.now()) next.startsAt = "Start time must be in the future.";
    if (end && !Number.isFinite(end.getTime())) next.endsAt = "Enter a valid end date and time.";
    else if (start && end && end.getTime() <= start.getTime()) {
      next.endsAt = "End time must be after the start time.";
    }

    const capacity = Number(values.capacity);
    if (values.capacity && (!Number.isInteger(capacity) || capacity < 1)) {
      next.capacity = "Capacity must be a whole number greater than zero.";
    }

    if (values.eventType === "paid") {
      if (!tiers.length) next.tiers = "Add at least one ticket tier.";
      tiers.forEach((tier, index) => {
        if (!tier.name.trim()) next[`tier-name-${tier.key}`] = `Enter a name for ticket tier ${index + 1}.`;
        if (!tier.price || !Number.isFinite(Number(tier.price)) || Number(tier.price) <= 0) {
          next[`tier-price-${tier.key}`] = "Enter a price greater than ₦0.";
        }
        if (!tier.quantity || !Number.isInteger(Number(tier.quantity)) || Number(tier.quantity) < 1) {
          next[`tier-quantity-${tier.key}`] = "Enter a quantity greater than zero.";
        }
      });
      const tierQuantity = tiers.reduce((sum, tier) => sum + (Number(tier.quantity) || 0), 0);
      if (capacity > 0 && tierQuantity > capacity) {
        next.tiers = "Ticket tier quantities cannot exceed the event capacity.";
      }
    }

    if (intent === "publish" && !session?.user) next.form = "Sign in to publish an event.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const getOrCreateOrganizer = async (userId: string) => {
    const { data: existing, error: lookupError } = await supabase
      .from("organizers")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    if (lookupError) throw new Error(`Could not load your organizer profile: ${lookupError.message}`);
    if (existing) return existing;

    const slugName = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "organizer";
    const { data: created, error: createError } = await supabase
      .from("organizers")
      .insert({
        owner_id: userId,
        name: displayName,
        slug: `${slugName}-${userId.slice(0, 8)}`,
        community: `${values.city.trim()} events`,
        description: `Events hosted by ${displayName}.`,
        location: `${values.city.trim()}, Nigeria`,
      })
      .select("*")
      .single();
    if (createError) throw new Error(`Could not create your organizer profile: ${createError.message}`);
    return created;
  };

  const saveEvent = async (intent: "draft" | "publish") => {
    setRequestError(null);
    setSuccess(null);
    if (!validate(intent)) return;
    if (!session?.user) {
      setRequestError("Sign in to create an event.");
      return;
    }

    setBusy(intent);
    const eventId = draftId ?? crypto.randomUUID();
    let uploadedPath: string | null = null;
    let eventSaved = false;

    try {
      let imageUrl = savedImageUrl;
      if (cover) {
        const extension = cover.type === "image/jpeg" ? "jpg" : cover.type.split("/")[1];
        uploadedPath = `${session.user.id}/${eventId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("event-covers")
          .upload(uploadedPath, cover, {
            cacheControl: "3600",
            contentType: cover.type,
            upsert: false,
          });
        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
        imageUrl = supabase.storage.from("event-covers").getPublicUrl(uploadedPath).data.publicUrl;
      }
      if (!imageUrl) throw new Error("Upload an event cover image before saving.");

      const organizer = await getOrCreateOrganizer(session.user.id);
      const startsAt = new Date(values.startsAt).toISOString();
      const endsAt = new Date(values.endsAt).toISOString();
      const prices = values.eventType === "paid" ? tiers.map((tier) => Number(tier.price)) : [];
      const row = {
        organizer_id: organizer.id,
        created_by: session.user.id,
        title: values.title.trim(),
        summary: values.summary.trim(),
        description: values.description.trim(),
        category: values.category,
        image_url: imageUrl,
        starts_at: startsAt,
        ends_at: endsAt,
        venue_name: values.venueName.trim(),
        address: values.address.trim(),
        city: values.city.trim(),
        event_type: values.eventType,
        capacity: Number(values.capacity),
        price_from: prices.length ? Math.min(...prices) : 0,
        currency: "NGN",
        status: "upcoming",
        published: false,
      };

      // Editing must preserve the event's published state; new rows start unpublished.
      const updateRow: Record<string, unknown> = { ...row };
      if (isEditing) delete updateRow.published;
      const result = draftId
        ? await supabase.from("events").update((isEditing ? updateRow : row) as typeof row).eq("id", eventId).eq("created_by", session.user.id).select("id").single()
        : await supabase.from("events").insert({
            ...row,
            id: eventId,
            slug: `${values.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)}-${eventId.slice(0, 8)}`,
          }).select("id").single();
      if (result.error) throw new Error(`Could not save the event: ${result.error.message}`);
      eventSaved = true;
      setDraftId(eventId);
      setSavedImageUrl(imageUrl);
      setCover(null);

      const { error: tiersError } = await supabase.rpc("replace_event_ticket_tiers_v1", {
        p_event_id: eventId,
        p_tiers: values.eventType === "paid"
          ? tiers.map((tier) => ({
              name: tier.name.trim(),
              price: Number(tier.price),
              quantity: Number(tier.quantity),
            }))
          : [],
      });
      if (tiersError) {
        throw new Error(`The event draft was saved, but ticket tiers could not be saved: ${tiersError.message}`);
      }

      if (intent === "publish") {
        const { data: publishedEvent, error: publishError } = await supabase
          .from("events")
          .update({ published: true })
          .eq("id", eventId)
          .eq("created_by", session.user.id)
          .select("id, published")
          .single();
        if (publishError) throw new Error(`Your draft was saved, but publishing failed: ${publishError.message}`);
        if (!publishedEvent?.published) {
          throw new Error("Your draft was saved, but the event could not be confirmed as published.");
        }
        setSuccess("Your event is published. Opening its event page…");
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        await navigate({ to: "/events/$eventId", params: { eventId } });
      } else {
        setSuccess(isEditing ? "Changes saved." : "Draft saved. It will stay hidden from Explore until you publish it.");
      }
    } catch (caught) {
      let message = caught instanceof Error ? caught.message : "Something went wrong while saving your event.";
      if (!eventSaved && uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from("event-covers").remove([uploadedPath]);
        if (cleanupError) message += ` The uploaded image could not be cleaned up: ${cleanupError.message}`;
      }
      setRequestError(message);
    } finally {
      setBusy(null);
    }
  };

  if (authLoading || (!session && !requestError) || (editId && editLoading)) {
    return <div className="grid min-h-64 place-items-center text-muted-text" aria-busy="true">{editId ? "Loading your event…" : "Checking your account…"}</div>;
  }

  if (editId && editError) {
    return (
      <div className="mx-auto w-full max-w-[920px] px-md py-xl lg:px-xl lg:py-2xl">
        <p className="type-body rounded-md border border-transactional/40 bg-transactional/10 p-md text-transactional" role="alert">
          We couldn&apos;t open this event for editing. {editError}
        </p>
        <Link to="/app/organizer/events" className="focus-ring type-body mt-lg inline-flex min-h-11 items-center gap-xs rounded-full text-muted-text hover:text-primary-text">
          <ArrowLeft aria-hidden className="size-4" />Back to My events
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[920px] px-md py-xl lg:px-xl lg:py-2xl">
      <Link to={isEditing ? "/app/organizer/events" : "/app"} className="focus-ring type-body mb-lg inline-flex min-h-11 items-center gap-xs rounded-full text-muted-text hover:text-primary-text">
        <ArrowLeft aria-hidden className="size-4" />{isEditing ? "Back to My events" : "Back to Outrazo"}
      </Link>
      <div className="mb-xl">
        <p className="type-caption font-semibold uppercase tracking-[0.16em] text-accent">Organizer tools</p>
        <h1 className="type-h1 mt-xs">{isEditing ? "Edit event" : "Create an event"}</h1>
        <p className="type-body-lg mt-sm max-w-[60ch] text-muted-text">{isEditing ? "Update the details below. Saving applies your changes to the existing event." : "Add the details, set your ticket options, then publish when everything is ready."}</p>
      </div>

      {requestError ? <p className="type-body mb-lg rounded-md border border-transactional/40 bg-transactional/10 p-md text-transactional" role="alert">{requestError}</p> : null}
      {errors.form ? <p className="type-body mb-lg rounded-md border border-transactional/40 bg-transactional/10 p-md text-transactional" role="alert">{errors.form}</p> : null}
      {success ? <p className="type-body mb-lg rounded-md border border-accent/30 bg-accent/10 p-md text-primary-text" role="status">{success}</p> : null}

      <form
        className="grid gap-lg"
        noValidate
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void saveEvent("publish");
        }}
      >
        <CopilotPanel accessToken={session?.access_token ?? null} onApply={applyCopilot} />
        <FormSection title="Event details" description="Give people a clear picture of what they can expect.">
          <Input label="Event title" value={values.title} maxLength={120} error={errors.title} placeholder="e.g. Lagos Night Market" onChange={(event) => update("title", event.currentTarget.value)} />
          <Input label="Short summary" value={values.summary} maxLength={220} error={errors.summary} placeholder="A one-line introduction for event cards." onChange={(event) => update("summary", event.currentTarget.value)} />
          <TextAreaField label="Full description" value={values.description} error={errors.description} placeholder="Tell guests what the event includes, who it is for, and what they should know." onChange={(value) => update("description", value)} />
          <SelectField label="Category" value={values.category} error={errors.category} onChange={(value) => update("category", value)}>
            <option value="">Choose a category</option>
            {CATEGORIES.filter((category) => category.id !== "all").map((category) => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </SelectField>
          <div className="grid gap-sm sm:grid-cols-2" role="group" aria-label="Event type">
            {(["free", "paid"] as const).map((eventType) => (
              <button
                key={eventType}
                type="button"
                aria-pressed={values.eventType === eventType}
                className={`focus-ring rounded-md border p-md text-left transition-colors ${values.eventType === eventType ? "border-accent bg-accent/10" : "border-line bg-canvas"}`}
                onClick={() => {
                  update("eventType", eventType);
                  if (eventType === "paid" && !tiers.length) setTiers([initialTier()]);
                }}
              >
                <span className="type-body block font-semibold text-primary-text">{eventType === "free" ? "Free entry" : "Paid tickets"}</span>
                <span className="type-caption text-muted-text">{eventType === "free" ? "No ticket price required." : "Set ticket prices in Nigerian naira."}</span>
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection title="Cover image" description="Use a clear landscape image. JPG, PNG, or WebP up to 5 MB.">
          <label className={`focus-ring grid min-h-44 cursor-pointer place-items-center overflow-hidden rounded-md border border-dashed bg-canvas text-center ${errors.cover ? "border-transactional" : "border-line hover:border-accent"}`}>
            {coverPreview ? (
              <img src={coverPreview} alt="Event cover preview" className="max-h-72 w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-sm p-lg">
                <span className="grid size-11 place-items-center rounded-full bg-accent/10 text-accent"><ImagePlus aria-hidden className="size-5" /></span>
                <span className="type-body font-semibold text-primary-text">Choose an event cover</span>
                <span className="type-caption text-muted-text">JPG, PNG or WebP · up to 5 MB</span>
              </span>
            )}
            <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectCover} aria-label="Upload event cover image" />
          </label>
          {errors.cover ? <p className="type-caption text-transactional" role="alert">{errors.cover}</p> : null}
          {coverPreview ? <p className="type-caption text-muted-text">{cover?.name ?? "Current event cover"} · ready to upload</p> : null}
        </FormSection>

        <FormSection title="Date and location" description="Use the local time for the city where your event takes place.">
          <div className="grid gap-md sm:grid-cols-2">
            <Input type="datetime-local" label="Starts" value={values.startsAt} min={isEditing ? undefined : minDateTime} error={errors.startsAt} onChange={(event) => update("startsAt", event.currentTarget.value)} />
            <Input type="datetime-local" label="Ends" value={values.endsAt} min={values.startsAt || (isEditing ? undefined : minDateTime)} error={errors.endsAt} onChange={(event) => update("endsAt", event.currentTarget.value)} />
          </div>
          <Input label="Venue name" value={values.venueName} error={errors.venueName} placeholder="e.g. Freedom Park" onChange={(event) => update("venueName", event.currentTarget.value)} />
          <Input label="Street address" value={values.address} error={errors.address} placeholder="Street, district or neighbourhood" onChange={(event) => update("address", event.currentTarget.value)} />
          <Input label="City" value={values.city} error={errors.city} placeholder="e.g. Lagos" onChange={(event) => update("city", event.currentTarget.value)} />
          <Input type="number" label="Ticket capacity" value={values.capacity} min={1} step={1} error={errors.capacity} hint="Maximum number of guests for this event." placeholder="e.g. 250" onChange={(event) => update("capacity", event.currentTarget.value)} />
        </FormSection>

        {values.eventType === "paid" ? (
          <FormSection title="Ticket tiers" description="Set a price and available quantity for each ticket type.">
            <div className="grid gap-md">
              {tiers.map((tier, index) => (
                <div key={tier.key} className="grid gap-md rounded-md border border-line bg-canvas p-md sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_minmax(7rem,0.6fr)_auto] sm:items-end">
                  <Input label={`Tier ${index + 1} name`} value={tier.name} error={errors[`tier-name-${tier.key}`]} placeholder="General admission" onChange={(event) => {
                    const name = event.currentTarget.value;
                    setTiers((current) => current.map((item) => item.key === tier.key ? { ...item, name } : item));
                  }} />
                  <Input type="number" label="Price (₦)" value={tier.price} min={1} step="0.01" error={errors[`tier-price-${tier.key}`]} placeholder="5000" onChange={(event) => {
                    const price = event.currentTarget.value;
                    setTiers((current) => current.map((item) => item.key === tier.key ? { ...item, price } : item));
                  }} />
                  <Input type="number" label="Quantity" value={tier.quantity} min={1} step={1} error={errors[`tier-quantity-${tier.key}`]} placeholder="100" onChange={(event) => {
                    const quantity = event.currentTarget.value;
                    setTiers((current) => current.map((item) => item.key === tier.key ? { ...item, quantity } : item));
                  }} />
                  <Button type="button" variant="outline" size="icon" className="size-11 justify-self-end" aria-label={`Remove ticket tier ${index + 1}`} disabled={tiers.length === 1} onClick={() => setTiers((current) => current.filter((item) => item.key !== tier.key))}>
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            {errors.tiers ? <p className="type-caption text-transactional" role="alert">{errors.tiers}</p> : null}
            <Button type="button" variant="outline" className="w-fit" leadingIcon={<Plus aria-hidden className="size-4" />} onClick={() => setTiers((current) => [...current, initialTier()])}>Add ticket tier</Button>
          </FormSection>
        ) : null}

        <div className="sticky bottom-0 z-10 -mx-md grid grid-cols-1 gap-sm border-t border-line bg-canvas/95 p-md backdrop-blur-md sm:static sm:mx-0 sm:flex sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:pt-sm">
          <Button type="button" variant="outline" className="order-2 sm:order-1" disabled={busy !== null} loading={busy === "draft"} leadingIcon={<Upload aria-hidden className="size-4" />} onClick={() => void saveEvent("draft")}>
            Save Draft
          </Button>
          <Button type="submit" className="order-1 sm:order-2" disabled={busy !== null} loading={busy === "publish"} leadingIcon={<CalendarPlus aria-hidden className="size-4" />}>
            Publish Event
          </Button>
        </div>
      </form>
    </div>
  );
}

function FormSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-md rounded-lg border border-line bg-card p-md shadow-card sm:gap-lg sm:p-lg">
      <div>
        <h2 className="type-h3">{title}</h2>
        <p className="type-body mt-xs text-muted-text">{description}</p>
      </div>
      <div className="grid gap-md">{children}</div>
    </section>
  );
}

function TextAreaField({
  label,
  value,
  error,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = `event-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="grid gap-sm">
      <label className="type-caption text-muted-text" htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={value}
        maxLength={5000}
        rows={5}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`type-body min-h-32 w-full resize-y rounded-md border bg-card p-md text-primary-text outline-none placeholder:text-subtle-text focus:border-accent ${error ? "border-transactional" : "border-line"}`}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error ? <p id={`${id}-error`} className="type-caption text-transactional" role="alert">{error}</p> : null}
    </div>
  );
}

function SelectField({
  label,
  value,
  error,
  children,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  children: React.ReactNode;
  onChange: (value: string) => void;
}) {
  const id = `event-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="grid gap-sm">
      <label className="type-caption text-muted-text" htmlFor={id}>{label}</label>
      <select id={id} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className={`type-body h-12 rounded-md border bg-card px-md text-primary-text outline-none focus:border-accent ${error ? "border-transactional" : "border-line"}`} onChange={(event) => onChange(event.currentTarget.value)}>
        {children}
      </select>
      {error ? <p id={`${id}-error`} className="type-caption text-transactional" role="alert">{error}</p> : null}
    </div>
  );
}
