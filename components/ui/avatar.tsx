"use client";
import * as React from "react";
import * as A from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";
export function Avatar({ className, ...p }: React.ComponentProps<typeof A.Root>) {
  return <A.Root className={cn("relative flex size-9 shrink-0 overflow-hidden rounded-full", className)} {...p} />;
}
export function AvatarFallback({ className, ...p }: React.ComponentProps<typeof A.Fallback>) {
  return <A.Fallback className={cn("flex size-full items-center justify-center rounded-full bg-muted text-sm font-medium", className)} {...p} />;
}
