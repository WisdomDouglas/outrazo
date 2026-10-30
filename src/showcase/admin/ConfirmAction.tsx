import { useState } from "react";

import { Button } from "@/design-system/components/Button";

interface ConfirmActionProps {
  label: string;
  question: string;
  onConfirm: () => Promise<void>;
  disabled: boolean;
}

/** Two-step inline confirmation for consequential admin actions. */
export function ConfirmAction({ label, question, onConfirm, disabled }: ConfirmActionProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-xs">
      <span className="type-body font-medium">{question}</span>
      <Button
        variant="outline"
        size="sm"
        loading={busy}
        onClick={() => {
          setBusy(true);
          void onConfirm().finally(() => {
            setBusy(false);
            setConfirming(false);
          });
        }}
      >
        Confirm
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}
