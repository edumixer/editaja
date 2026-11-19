"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export function DropdownMenuContent({ className, sideOffset = 6, ...p }: React.ComponentProps<typeof M.Content>) {
  return <M.Portal><M.Content sideOffset={sideOffset} className={cn("z-50 min-w-44 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg", className)} {...p} /></M.Portal>;
}
export function DropdownMenuItem({ className, ...p }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn("relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4", className)} {...p} />;
}
export function DropdownMenuLabel({ className, ...p }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)} {...p} />;
}
export function DropdownMenuSeparator({ className, ...p }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...p} />;
}
