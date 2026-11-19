"use client";
import * as React from "react";
import * as P from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";
export function Progress({ className, value, indicatorClassName, ...p }: React.ComponentProps<typeof P.Root> & { indicatorClassName?: string }) {
  return (
    <P.Root className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)} {...p}>
      <P.Indicator className={cn("h-full w-full flex-1 brand-gradient transition-transform duration-500", indicatorClassName)} style={{ transform: `translateX(-${100 - (value || 0)}%)` }} />
    </P.Root>
  );
}
