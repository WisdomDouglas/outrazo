import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label; always provide one for accessibility. */
  label?: string;
  /** Supporting guidance shown under the field. */
  hint?: string;
  /** Field-level validation message. Sets the invalid styling and aria state. */
  error?: string;
  /** Icon rendered inside the field, before the value. */
  leadingIcon?: ReactNode;
}

/** 48px token-styled text field with label, hint, and field-level error. */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, leadingIcon, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className="flex w-full flex-col gap-sm">
        {label ? (
          <label htmlFor={inputId} className="type-caption text-muted-text">
            {label}
          </label>
        ) : null}
        <div
          className={cn(
            "flex h-12 items-center gap-sm rounded-md border border-line bg-card px-md transition-colors",
            "focus-within:border-accent",
            error && "border-transactional focus-within:border-transactional",
          )}
        >
          {leadingIcon ? (
            <span className="text-subtle-text flex shrink-0 items-center">{leadingIcon}</span>
          ) : null}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              "type-body w-full bg-transparent text-primary-text outline-none placeholder:text-subtle-text disabled:cursor-not-allowed disabled:opacity-40",
              className,
            )}
            {...props}
          />
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="type-caption text-transactional">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="type-caption text-subtle-text">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";
