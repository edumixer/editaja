import { Badge } from "@/components/ui/badge";
import { STATUS_INFO, type Status } from "@/lib/data";
import { Loader2 } from "lucide-react";
export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_INFO[status];
  return (
    <Badge variant={s.variant}>
      {(status === "editando" || status === "recusado") && <Loader2 className="animate-spin" />}
      {status !== "editando" && status !== "recusado" && <span className="size-1.5 rounded-full bg-current" />}
      {s.label}
    </Badge>
  );
}
