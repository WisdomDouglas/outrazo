import { createFileRoute } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useAccessToken } from "@/showcase/admin/admin-client";
import {
  getPayoutDetails,
  listOwnOrganizerProfiles,
  savePayoutDetails,
  type OwnOrganizerProfile,
  type PayoutDetailsRow,
} from "@/showcase/organizer/organizer-reports";
import { maskAccountNumber, validatePayoutDetails } from "@/showcase/organizer/organizer-payout";

export const Route = createFileRoute("/app/organizer/payment-details")({
  head: () => ({ meta: [
    { title: "Payment Details — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Bank details for manual organizer payouts." },
  ] }),
  component: OrganizerPaymentDetailsPage,
});

function friendlyError(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  return "Something went wrong. Please try again.";
}

function OrganizerPaymentDetailsPage() {
  const token = useAccessToken();
  const [profiles, setProfiles] = useState<OwnOrganizerProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState<PayoutDetailsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeId = selectedId ?? profiles[0]?.id ?? null;

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to manage payout details.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const result = await listOwnOrganizerProfiles({ headers });
      setProfiles(result.profiles);
      const target = selectedId ?? result.profiles[0]?.id ?? null;
      if (target) {
        const details = await getPayoutDetails({ data: { organizerId: target }, headers });
        setSaved(details.details);
        if (details.details) {
          setBankName(details.details.bankName);
          setAccountNumber(details.details.accountNumber);
          setAccountName(details.details.accountName);
        } else {
          setBankName("");
          setAccountNumber("");
          setAccountName("");
        }
      }
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }, [selectedId, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!token || !activeId || saving) return;
    setFormError(null);
    setNotice(null);
    const validated = validatePayoutDetails({
      organizerId: activeId,
      bankName,
      accountNumber,
      accountName,
    });
    if (!validated.ok) {
      setFormError(validated.error);
      return;
    }
    setSaving(true);
    try {
      await savePayoutDetails({
        data: validated.value,
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotice("Payout details saved. Outrazo staff use these for manual payouts only.");
      await refresh();
    } catch (caught) {
      setFormError(friendlyError(caught));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-md" aria-label="Loading payout details">
        <Skeleton className="h-12 max-w-md rounded-md" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="We couldn't load payout details." description={error} onRetry={() => void refresh()} />;
  }

  if (profiles.length === 0) {
    return (
      <EmptyState
        icon={<Landmark aria-hidden className="size-5" />}
        title="No organizer profile yet."
        description="Create an event first — your organizer profile is set up along the way, then payout details unlock here."
      />
    );
  }

  return (
    <div className="grid max-w-xl gap-lg">
      <div>
        <h2 className="type-h2">Payment details</h2>
        <p className="type-body mt-xs text-muted-text">
          Bank details per organizer profile. Outrazo pays organizers manually and audited —
          these details are never used for automatic transfers.
        </p>
      </div>

      <label className="grid gap-sm">
        <span className="type-caption text-muted-text">Organizer profile</span>
        <select
          value={activeId ?? ""}
          onChange={(selectEvent) => {
            setSelectedId(selectEvent.currentTarget.value || null);
            setNotice(null);
            setFormError(null);
          }}
          className="type-body h-12 rounded-md border border-line bg-card px-md text-primary-text outline-none focus:border-accent"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.name}</option>
          ))}
        </select>
      </label>

      {notice ? (
        <p className="type-body rounded-lg border border-line bg-card px-md py-sm" role="status">{notice}</p>
      ) : null}
      {saved ? (
        <p className="type-body rounded-lg border border-line bg-card px-md py-sm text-muted-text" role="status">
          Current account on file: {saved.bankName} · {maskAccountNumber(saved.accountNumber)}
          {saved.updatedAt ? ` · updated ${new Date(saved.updatedAt).toLocaleDateString()}` : ""}.
          Saving replaces it.
        </p>
      ) : (
        <p className="type-body rounded-lg border border-line bg-card px-md py-sm text-muted-text" role="status">
          No payout details saved for this profile yet.
        </p>
      )}

      <div className="grid gap-md rounded-lg border border-line bg-card p-lg shadow-card">
        <label className="type-body grid gap-xs font-semibold" htmlFor="payout-bank">
          Bank name
          <input
            id="payout-bank"
            type="text"
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
            placeholder="Example: GTBank"
            autoComplete="off"
            className="type-body focus-ring rounded-md border border-line bg-canvas px-md py-sm font-normal"
          />
        </label>
        <label className="type-body grid gap-xs font-semibold" htmlFor="payout-account">
          Account number
          <input
            id="payout-account"
            type="text"
            inputMode="numeric"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            placeholder="10-digit NUBAN"
            autoComplete="off"
            className="type-body focus-ring rounded-md border border-line bg-canvas px-md py-sm font-normal"
          />
        </label>
        <label className="type-body grid gap-xs font-semibold" htmlFor="payout-name">
          Account name
          <input
            id="payout-name"
            type="text"
            value={accountName}
            onChange={(event) => setAccountName(event.target.value)}
            placeholder="Name on the account"
            autoComplete="off"
            className="type-body focus-ring rounded-md border border-line bg-canvas px-md py-sm font-normal"
          />
        </label>
        {formError ? (
          <p className="type-body text-transactional" role="alert">{formError}</p>
        ) : null}
        <div>
          <Button type="button" loading={saving} disabled={saving} onClick={() => void save()}>
            Save payout details
          </Button>
        </div>
      </div>
    </div>
  );
}
