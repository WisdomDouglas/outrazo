import { createFileRoute } from "@tanstack/react-router";
import { Landmark, Moon, Settings, Sun } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/design-system/components/Button";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Input } from "@/design-system/components/Input";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useTheme } from "@/design-system/lib/use-theme";
import { maskAccountNumber, NIGERIAN_BANKS, OTHER_BANK_OPTION } from "@/showcase/rewards/reward-points";
import { useMyBankDetails } from "@/showcase/rewards/use-rewards";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [
    { title: "Settings — Outrazo" }, { name: "description", content: "Manage your Outrazo app appearance and bank details." },
    { property: "og:title", content: "Settings — Outrazo" }, { property: "og:description", content: "Manage your Outrazo app appearance and bank details." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto w-full max-w-[760px] px-md py-xl lg:px-xl lg:py-2xl">
      <h1 className="type-h1">Settings</h1>
      <p className="type-body-lg mt-sm text-muted-text">Make Outrazo feel right for you.</p>

      <section className="mt-xl rounded-2xl border border-line bg-card p-lg sm:p-xl" aria-labelledby="appearance-title">
        <div className="flex items-start gap-md">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
            <Settings aria-hidden className="size-5" />
          </span>
          <div>
            <h2 id="appearance-title" className="type-h3">Appearance</h2>
            <p className="type-body mt-xs text-muted-text">Choose the theme used across the app.</p>
          </div>
        </div>

        <div className="mt-lg grid grid-cols-2 gap-sm" role="group" aria-label="Appearance mode">
          <Button
            type="button"
            variant={theme === "light" ? "primary" : "outline"}
            className="w-full"
            leadingIcon={<Sun aria-hidden className="size-4" />}
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
          >
            Light mode
          </Button>
          <Button
            type="button"
            variant={theme === "dark" ? "primary" : "outline"}
            className="w-full"
            leadingIcon={<Moon aria-hidden className="size-4" />}
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
          >
            Dark mode
          </Button>
        </div>
        <p className="type-caption mt-md text-muted-text">Your choice is saved on this device.</p>
      </section>

      <BankDetailsSection />
    </div>
  );
}

function BankDetailsSection() {
  const bank = useMyBankDetails();
  const [bankName, setBankName] = useState("");
  const [customBank, setCustomBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [editing, setEditing] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const savedName = bank.details?.bankName;
  useEffect(() => {
    if (!bank.details) return;
    const name = bank.details.bankName;
    if ((NIGERIAN_BANKS as readonly string[]).includes(name)) {
      setBankName(name);
      setCustomBank("");
    } else {
      setBankName(OTHER_BANK_OPTION);
      setCustomBank(name);
    }
    setAccountNumber(bank.details.accountNumber);
    setAccountName(bank.details.accountName);
  }, [bank.details]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    const resolvedBank = bankName === OTHER_BANK_OPTION ? customBank.trim() : bankName;
    if (resolvedBank.length < 2) {
      setFieldError("Choose your bank.");
      return;
    }
    if (!/^[0-9]{10}$/.test(accountNumber.trim())) {
      setFieldError("Enter your 10-digit account number.");
      return;
    }
    if (accountName.trim().length < 2) {
      setFieldError("Enter the name on the account.");
      return;
    }
    setFieldError(null);
    try {
      await bank.save({
        bankName: resolvedBank,
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
      });
      setEditing(false);
      setNotice("Bank details saved.");
    } catch (caught) {
      setFieldError(caught instanceof Error ? caught.message : "Could not save your bank details.");
    }
  };

  return (
    <section className="mt-xl rounded-2xl border border-line bg-card p-lg sm:p-xl" aria-labelledby="bank-title">
      <div className="flex items-start gap-md">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
          <Landmark aria-hidden className="size-5" />
        </span>
        <div>
          <h2 id="bank-title" className="type-h3">Bank account details</h2>
          <p className="type-body mt-xs text-muted-text">
            Where your rewards withdrawals are paid. Only you — and the finance staff who
            process your withdrawal — can see these details.
          </p>
        </div>
      </div>

      {bank.loading ? (
        <Skeleton className="mt-lg h-28 rounded-lg" />
      ) : bank.error ? (
        <div className="mt-lg">
          <ErrorState
            title="We couldn't load your bank details."
            description={bank.error}
            onRetry={bank.refresh}
          />
        </div>
      ) : bank.details && !editing ? (
        <div className="mt-lg grid gap-sm">
          <dl className="grid gap-sm rounded-lg border border-line bg-canvas p-md">
            <div className="flex justify-between gap-md">
              <dt className="type-body text-muted-text">Bank</dt>
              <dd className="type-body font-medium">{savedName}</dd>
            </div>
            <div className="flex justify-between gap-md">
              <dt className="type-body text-muted-text">Account</dt>
              <dd className="type-body font-mono font-medium">
                {maskAccountNumber(bank.details.accountNumber)}
              </dd>
            </div>
            <div className="flex justify-between gap-md">
              <dt className="type-body text-muted-text">Name</dt>
              <dd className="type-body font-medium">{bank.details.accountName}</dd>
            </div>
          </dl>
          {notice ? (
            <p className="type-body text-accent" role="status">
              {notice}
            </p>
          ) : null}
          <div>
            <Button type="button" variant="outline" onClick={() => { setEditing(true); setNotice(null); }}>
              Edit details
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={save} className="mt-lg grid gap-md">
          <div className="flex w-full flex-col gap-sm">
            <label htmlFor="bank-name" className="type-caption text-muted-text">
              Bank
            </label>
            <div className="flex h-12 items-center rounded-md border border-line bg-card px-md transition-colors focus-within:border-accent">
              <select
                id="bank-name"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                className="type-body w-full bg-transparent text-primary-text outline-none"
              >
                <option value="">Choose your bank</option>
                {NIGERIAN_BANKS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value={OTHER_BANK_OPTION}>{OTHER_BANK_OPTION}</option>
              </select>
            </div>
          </div>
          {bankName === OTHER_BANK_OPTION ? (
            <Input
              label="Bank name"
              value={customBank}
              onChange={(event) => setCustomBank(event.target.value)}
              placeholder="Your bank's name"
              maxLength={80}
            />
          ) : null}
          <Input
            label="Account number"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
            placeholder="10-digit NUBAN number"
            inputMode="numeric"
            maxLength={10}
          />
          <Input
            label="Account holder name"
            value={accountName}
            onChange={(event) => setAccountName(event.target.value)}
            placeholder="Name on the account"
            maxLength={100}
          />
          {fieldError ? (
            <p className="type-body text-transactional" role="alert">
              {fieldError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-sm">
            <Button type="submit" loading={bank.saving} disabled={bank.saving}>
              Save details
            </Button>
            {bank.details ? (
              <Button type="button" variant="ghost" onClick={() => { setEditing(false); setFieldError(null); }}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
