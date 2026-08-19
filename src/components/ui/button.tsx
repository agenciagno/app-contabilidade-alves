import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — component set "Button" do Figma (3 variantes × 2 tamanhos).
 * Raio 8px (--r-sm) em todos; texto SC/ui-strong (13 SemiBold).
 * Os nomes shadcn (outline/secondary/…) são preservados porque o app inteiro
 * já os consome; os três do DS são: default=primary, outline=secondary, ghost.
 *
 * Ação primária é --action (classe Tailwind `action`) desde 10/08/2026 —
 * --brand virou só chrome/banner. Ver _context/marca/04-design-system.md §3.3.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm border text-ui-strong ring-offset-background transition-[background,color,border-color] duration-[120ms] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-action bg-action text-on-action hover:bg-action-hover",
        destructive: "border-danger bg-danger text-white hover:bg-danger/90",
        outline: "border-line bg-paper text-ink hover:bg-bg-2",
        secondary: "border-line bg-paper text-ink hover:bg-bg-2",
        ghost: "border-transparent bg-transparent text-muted-ink hover:bg-bg-2 hover:text-ink",
        link: "border-transparent text-action underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-[7px] px-3.5",   // md — 36px
        sm: "h-8 gap-1.5 px-3 text-ui",
        lg: "h-11 gap-2 px-[18px]",        // lg — 44px
        icon: "h-9 w-9 gap-0 rounded-md p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
