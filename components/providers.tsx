"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { StoreProvider } from "@/lib/store";
import { EstilosProvider } from "@/lib/estilos-store";
import { ProdutosProvider } from "@/lib/produtos-store";
import { TextosProvider } from "@/lib/textos-store";
import * as React from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <StoreProvider><EstilosProvider><ProdutosProvider><TextosProvider>
        {children}
        <Toaster richColors position="top-center" closeButton />
      </TextosProvider></ProdutosProvider></EstilosProvider></StoreProvider>
    </ThemeProvider>
  );
}
