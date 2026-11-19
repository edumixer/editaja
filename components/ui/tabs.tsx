"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
export const Tabs = T.Root;
export function TabsList({ className, ...p }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex h-11 max-w-full items-center overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground scrollbar-none sm:h-10", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof T.Trigger>) {
  return <T.Trigger className={cn("inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm sm:py-1.5 font-medium transition-all outline-none data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm [&_svg]:size-4", className)} {...p} />;
}
export function TabsContent({ className, ...p }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn("mt-4 outline-none", className)} {...p} />;
}
