// Scout discovery review: source evidence, extraction provenance, reviewer
// edits, cover upload, and approve/dismiss. Originals stay on the discovery
// row forever; edits apply only to the new draft.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { supabase } from "@/integrations/supabase/external-client";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import { roleHasPermission } from "@/showcase/admin/permissions";
import { useAuth } from "@/showcase/auth/auth-context";
import {
  approveScoutDiscovery,
  dismissScoutDiscovery,
  getScoutDiscovery,
} from "@/showcase/scout/scout-functions";
import {
  buildScoutAttribution,
  SCOUT_EVENT_CATEGORIES,
} from "@/showcase/scout/scout-review";

export const Route = createFileRoute("/admin/scout/discoveries/$discoveryId")({
  head: () => ({ meta: [
    { title: "Scout review — Admin Console — Outrazo" },
    { name: "description", content: "Review a discovered event and approve it to draft." },
  ] }),
  component: ScoutReviewPage,
});

type Discovery = Awaited<ReturnType<typeof getScoutDiscovery>>["discovery"];

function provenanceBadge(value: string | undefined) {
  if (value === "confirmed") return <Badge variant="accent">Confirmed</Badge>;
  if (value === "ambiguous") return <Badge variant="transactional">Ambiguous</Badge>;
  return <Badge variant="neutral">Missing</Badge>;
}

function EvidenceSection({ discovery }: { discovery: Discovery }) {
  const entries: Array<[string, string | null, string | undefined]> = [
    ["Title", discovery.title, discovery.provenance?.title],
    ["Starts", discovery.starts_at ? new Date(discovery.starts_at).toLocaleString() : null, discovery.provenance?.startsAt],
    ["Venue", discovery.venue_name, discovery.provenance?.venue],
    ["City", discovery.city, discovery.provenance?.city],
    ["Organizer", discovery.external_organizer_name, discovery.provenance?.organizer],
  ];
  return (
    <section aria-label="Source evidence" className="grid gap-sm rounded-lg border border-line bg-card p-lg">
      <h3 className="type-h3">Source evidence</h3>
      <dl className="grid gap-xs">
        {entries.map(([label, value, grade]) => (
          <div key={label} className="flex flex-wrap items-center justify-between gap-xs border-b border-line pb-xs last:border-0">
            <dt className="type-body text-muted-text">{label}</dt>
            <dd className="type-body flex items-center gap-xs font-semibold">
              <span>{value ?? "—"}</span>
              {provenanceBadge(grade)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-xs">
        <p className="type-body">
          <span className="text-muted-text">Source: </span>
          <a href={discovery.source_url} target="_blank" rel="noreferrer" className="focus-ring font-semibold text-accent underline-offset-4 hover:underline">
            {discovery.source_domain}
          </a>
        </p>
        <p className="type-caption text-muted-text">
          Fetched {discovery.fetched_at ? new Date(discovery.fetched_at).toLocaleString() : "—"} · {discovery.fetch_status ?? "unknown"}
        </p>
        {discovery.source_snapshot ? (
          <details className="grid gap-xs">
            <summary className="focus-ring type-body cursor-pointer font-semibold text-accent">Fetched page text</summary>
            <p className="type-body max-h-64 overflow-y-auto rounded border border-line bg-canvas p-sm whitespace-pre-wrap">{discovery.source_snapshot}</p>
          </details>
        ) : null}
        {discovery.citations.length > 0 ? (
          <div className="grid gap-xs">
            <p className="type-body font-semibold">Citations</p>
            <ul className="type-body list-disc space-y-2xs pl-md">
              {discovery.citations.map((citation) => (
                <li key={citation.url}>
                  <a href={citation.url} target="_blank" rel="noreferrer" className="focus-ring text-accent underline-offset-4 hover:underline">
                    {citation.title ?? citation.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {discovery.matched_event_id ? (
          <p className="type-body">
            <Badge variant="outline">Possible duplicate ({discovery.match_confidence})</Badge>{" "}
            <Link
              to="/events/$eventId"
              params={{ eventId: discovery.matched_event_id }}
              className="focus-ring font-semibold text-accent underline-offset-4 hover:underline"
            >
              Open suspected match
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ReviewForm({
  discovery,
  token,
  userId,
  onDone,
}: {
  discovery: Discovery;
  token: string;
  userId: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(discovery.title ?? "");
  const [summary, setSummary] = useState(discovery.summary ?? "");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("tech");
  const [startsAt, setStartsAt] = useState(toLocalInput(discovery.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(discovery.ends_at));
  const [venueName, setVenueName] = useState(discovery.venue_name ?? "");
  const [address, setAddress] = useState(discovery.address ?? "");
  const [city, setCity] = useState(discovery.city ?? "");
  const [capacity, setCapacity] = useState("100");
  const [externalTicketUrl, setExternalTicketUrl] = useState(discovery.external_ticket_url ?? "");
  const [organizers, setOrganizers] = useState<Array<{ id: string; name: string }>>([]);
  const [organizerId, setOrganizerId] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [attributionOk, setAttributionOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("organizers").select("id,name").eq("owner_id", userId);
      setOrganizers((data ?? []) as Array<{ id: string; name: string }>);
      if (data && data.length > 0) setOrganizerId((current) => current || (data[0] as { id: string }).id);
    })();
  }, [userId]);

  const uploadCover = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Cover must be a JPEG, PNG, or WebP image.");
      }
      if (file.size > 5 * 1024 * 1024) throw new Error("Cover must be under 5 MB.");
      const path = `${userId}/${discovery.id}/${crypto.randomUUID()}`;
      const { error: uploadError } = await supabase.storage.from("event-covers").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
      setCoverUrl(supabase.storage.from("event-covers").getPublicUrl(path).data.publicUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Image upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const attribution = buildScoutAttribution({
    organizerName: discovery.external_organizer_name,
    sourceUrl: discovery.source_url,
    reviewDateIso: new Date().toISOString(),
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!coverUrl) {
      setError("Upload a cover image first.");
      return;
    }
    if (!organizerId) {
      setError("Choose one of your organizers for this draft.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await approveScoutDiscovery({
        data: {
          discoveryId: discovery.id,
          organizerId,
          overrides: {
            title: title.trim(),
            summary: summary.trim(),
            description: description.trim(),
            category: category as (typeof SCOUT_EVENT_CATEGORIES)[number],
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            venueName: venueName.trim(),
            address: address.trim(),
            city: city.trim(),
            capacity: Number(capacity),
            externalTicketUrl: externalTicketUrl.trim() ? externalTicketUrl.trim() : null,
          },
          coverImageUrl: coverUrl,
          attributionConfirmed: true,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      onDone();
      window.location.assign(`/app/create-event?edit=${result.eventId}`);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (reason: string) => {
    setBusy(true);
    setError(null);
    try {
      await dismissScoutDiscovery({
        data: { discoveryId: discovery.id, reason: reason as "duplicate" },
        headers: { Authorization: `Bearer ${token}` },
      });
      onDone();
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "focus-ring type-body w-full rounded-lg border border-line-strong bg-canvas px-sm py-xs";

  return (
    <div className="grid gap-md">
      <form onSubmit={submit} className="grid gap-sm rounded-lg border border-line bg-card p-lg">
        <h3 className="type-h3">Reviewer edits → unpublished draft</h3>
        <p className="type-body text-muted-text">
          Originals above stay preserved. Your edits below become the draft, which stays
          unpublished until someone explicitly publishes it.
        </p>
        <label className="grid gap-xs"><span className="type-body font-semibold">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} className={inputClass} /></label>
        <label className="grid gap-xs"><span className="type-body font-semibold">Summary</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} required minLength={10} rows={2} className={inputClass} /></label>
        <label className="grid gap-xs"><span className="type-body font-semibold">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={20} rows={4} className={inputClass} /></label>
        <div className="grid gap-sm sm:grid-cols-2">
          <label className="grid gap-xs"><span className="type-body font-semibold">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {SCOUT_EVENT_CATEGORIES.map((option) => (
                <option key={option} value={option} className="capitalize">{option}</option>
              ))}
            </select></label>
          <label className="grid gap-xs"><span className="type-body font-semibold">Capacity</span>
            <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} required className={inputClass} /></label>
          <label className="grid gap-xs"><span className="type-body font-semibold">Starts</span>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required className={inputClass} /></label>
          <label className="grid gap-xs"><span className="type-body font-semibold">Ends</span>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required className={inputClass} /></label>
          <label className="grid gap-xs"><span className="type-body font-semibold">Venue</span>
            <input value={venueName} onChange={(e) => setVenueName(e.target.value)} required className={inputClass} /></label>
          <label className="grid gap-xs"><span className="type-body font-semibold">City</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} required className={inputClass} /></label>
        </div>
        <label className="grid gap-xs"><span className="type-body font-semibold">Address</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} required className={inputClass} /></label>
        <label className="grid gap-xs"><span className="type-body font-semibold">External ticket URL (https, optional)</span>
          <input value={externalTicketUrl} onChange={(e) => setExternalTicketUrl(e.target.value)} placeholder="https://…" className={inputClass} /></label>
        <div className="grid gap-xs">
          <span className="type-body font-semibold">Cover image (your own lawful upload)</span>
          {coverUrl ? (
            <p className="type-body text-accent">Uploaded ✓ — {coverUrl.slice(0, 80)}…</p>
          ) : (
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadCover(file);
              }}
              className="type-body"
            />
          )}
        </div>
        <label className="grid gap-xs"><span className="type-body font-semibold">Organizer for this draft</span>
          <select value={organizerId} onChange={(e) => setOrganizerId(e.target.value)} required className={inputClass}>
            {organizers.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select></label>
        <div className="grid gap-xs rounded-lg border border-dashed border-line p-sm">
          <p className="type-body">{attribution}</p>
          <label className="flex cursor-pointer items-center gap-xs">
            <input type="checkbox" checked={attributionOk} onChange={(e) => setAttributionOk(e.target.checked)} required className="accent-accent" />
            <span className="type-body font-semibold">I confirm this attribution will be saved on the draft.</span>
          </label>
        </div>
        {error ? <p className="type-body text-transactional">{error}</p> : null}
        <div className="flex flex-wrap gap-sm">
          <Button type="submit" variant="primary" disabled={busy || !attributionOk || !coverUrl}>
            {busy ? "Saving…" : "Approve → save unpublished draft"}
          </Button>
        </div>
      </form>

      <div className="grid gap-sm rounded-lg border border-line bg-card p-lg">
        <h3 className="type-h3">Dismiss instead</h3>
        <div className="flex flex-wrap gap-sm">
          {["duplicate", "expired", "not_an_event", "insufficient_evidence", "out_of_scope", "other"].map((reason) => (
            <Button key={reason} type="button" variant="outline" disabled={busy} onClick={() => void dismiss(reason)}>
              {reason.replaceAll("_", " ")}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoutReviewPage() {
  const { discoveryId } = Route.useParams();
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const { session } = useAuth();
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManage = role !== null && roleHasPermission(role, "scout.manage");

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getScoutDiscovery({
        data: { discoveryId },
        headers: { Authorization: `Bearer ${token}` },
      });
      setDiscovery(result.discovery);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, discoveryId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && discovery === null) {
    return (
      <div className="grid gap-md" aria-label="Loading discovery">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (error && discovery === null) {
    return <ErrorState title="We couldn't load this discovery." description={error} onRetry={() => void refresh()} />;
  }
  if (!discovery) return null;

  return (
    <div className="grid gap-lg">
      <div>
        <Link to="/admin/scout/discoveries" className="focus-ring type-body font-semibold text-accent underline-offset-4 hover:underline">
          ← Review queue
        </Link>
        <h2 className="type-h2 mt-sm">{discovery.title ?? "(untitled discovery)"}</h2>
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <Badge variant={discovery.status === "pending" ? "transactional" : discovery.status === "approved" ? "accent" : "neutral"}>
            {discovery.status.replace("_", " ")}
          </Badge>
          <span className="type-caption text-muted-text">
            {[discovery.city, discovery.state_code].filter(Boolean).join(", ") || "Location unknown"}
          </span>
        </div>
      </div>

      <EvidenceSection discovery={discovery} />

      {discovery.status === "pending" && token && session?.user && canManage ? (
        <ReviewForm discovery={discovery} token={token} userId={session.user.id} onDone={() => void refresh()} />
      ) : discovery.status !== "pending" ? (
        <p className="type-body text-muted-text">
          This discovery is {discovery.status.replace("_", " ")}
          {discovery.dismissal_reason ? ` (${discovery.dismissal_reason.replaceAll("_", " ")})` : ""}
          {discovery.auto_reject_reason ? ` — ${discovery.auto_reject_reason}` : ""}. Evidence above is preserved.
        </p>
      ) : null}
    </div>
  );
}
