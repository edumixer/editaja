"use client";
import * as React from "react";
import * as S from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
export function Switch({ className, ...p }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root className={cn("peer relative inline-flex h-6 w-11 shrink-0 after:absolute after:-inset-2.5 after:content-[''] items-center rounded-full border-2 border-transparent transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input disabled:opacity-50", className)} {...p}>
      <S.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-md ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </S.Root>
  );
}
