import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/utils";

const buttonVariants = cva(
  "type-body focus-ring inline-flex items-center justify-center gap-sm font-medium transition-[transform,background-color,box-shadow,border-color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-on-accent rounded-full hover:bg-accent-hover hover:shadow-glow",
        transactional:
          "bg-transactional text-on-transactional rounded-full hover:bg-transactional-hover",
        outline:
          "border-[1.5px] border-accent text-accent rounded-full bg-transparent hover:bg-accent/10",
        ghost:
          "text-primary-text rounded-full bg-transparent hover:bg-primary-text/8",
      },
      size: {
        sm: "h-11 px-lg text-[13px]",
        md: "h-12 px-xl",
        lg: "h-14 px-2xl text-[16px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and blocks interaction while an action is in flight. */
  loading?: boolean;
  /** Icon rendered before the label. */
  leadingIcon?: ReactNode;
}

/** Primary interactive control. Primary = brand action, transactional = ticketing/RSVP. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, loading = false, leadingIcon, children, disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : leadingIcon}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export { buttonVariants };
