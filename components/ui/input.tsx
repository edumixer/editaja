import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...p }: React.ComponentProps<"input">) {
  return <input className={cn("flex h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-base md:text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50", className)} {...p} />;
}
export function Textarea({ className, ...p }: React.ComponentProps<"textarea">) {
  return <textarea className={cn("flex min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base md:text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30", className)} {...p} />;
}
export function Label({ className, ...p }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium leading-none", className)} {...p} />;
}
