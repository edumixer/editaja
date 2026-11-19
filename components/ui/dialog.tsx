"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;
export function DialogContent({ className, children, ...p }: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in" />
      <D.Content className={cn("fixed z-50 grid max-h-[92dvh] w-full gap-4 overflow-y-auto overscroll-contain border bg-popover p-5 shadow-2xl inset-x-0 bottom-0 rounded-t-2xl sm:p-6 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl pb-safe", className)} onOpenAutoFocus={(e) => e.preventDefault()} {...p}>
        {children}
        <D.Close className="absolute right-3 top-3 grid size-9 place-items-center rounded-md opacity-60 transition-opacity hover:opacity-100"><X className="size-4" /><span className="sr-only">Fechar</span></D.Close>
      </D.Content>
    </D.Portal>
  );
}
export function DialogHeader({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...p} />;
}
export function DialogFooter({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...p} />;
}
export function DialogTitle({ className, ...p }: React.ComponentProps<typeof D.Title>) {
  return <D.Title className={cn("text-lg font-semibold", className)} {...p} />;
}
export function DialogDescription({ className, ...p }: React.ComponentProps<typeof D.Description>) {
  return <D.Description className={cn("text-sm text-muted-foreground", className)} {...p} />;
}
