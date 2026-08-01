import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge — component set "Badge" do Figma: pill, pad 3/8, texto SC/badge
 * (10.5 Medium). Os 5 tons do DS são success/warning/destructive/info/secondary;
 * os nomes shadcn seguem valendo porque o app já os consome.
 * Para o ponto colorido à esquerda use DsBadge de @/components/ds.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-[5px] rounded-pill border-0 px-2 py-[3px] text-badge font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-brand-soft text-brand",
        secondary: "bg-bg-2 text-muted-ink",
        destructive: "bg-danger-soft text-danger",
        outline: "border border-line text-ink",
        success: "bg-ok-soft text-ok",
        warning: "bg-warn-soft text-warn",
        info: "bg-brand-soft text-brand",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
