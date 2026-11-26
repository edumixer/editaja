"use client";
import * as React from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import type { Video } from "@/lib/data";

/** Confirmação antes de apagar: some da conta e do armazenamento, sem volta. */
export function ExcluirDialog({ video, onClose }: { video: (Video & { origemId?: string; statusBanco?: string }) | null; onClose: () => void }) {
  const { videos, excluirVideo } = useStore();
  const [apagando, setApagando] = React.useState(false);
  const versoes = video ? videos.filter((v) => (v as Video & { origemId?: string }).origemId === video.id).length : 0;
  const editando = video?.statusBanco === "editando";
  const confirmar = async () => {
    if (!video) return;
    setApagando(true);
    try {
      await excluirVideo(video.id);
      toast.success("Vídeo excluído", { description: versoes ? `As ${versoes} versões dele também foram apagadas.` : undefined });
      onClose();
    } catch (e) {
      toast.error("Não deu para excluir", { description: (e as Error).message });
    } finally { setApagando(false); }
  };
  return (
    <Dialog open={!!video} onOpenChange={(o) => { if (!o && !apagando) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir “{video?.titulo}”?</DialogTitle>
          <DialogDescription>
            O vídeo bruto, o editado e a capa são apagados da sua conta para sempre. Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
        {(versoes > 0 || editando) && (
          <div className="grid gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
            {versoes > 0 && <p>Este vídeo tem <b>{versoes} {versoes === 1 ? "versão" : "versões"}</b> (ganchos × CTAs) que também serão excluídas.</p>}
            {editando && <p>Ele está sendo editado agora. A edição será descartada.</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={apagando} onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={apagando} onClick={confirmar}><Trash2 /> {apagando ? "Excluindo…" : "Excluir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

