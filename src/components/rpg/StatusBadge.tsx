import { Badge } from "@/components/ui/badge";

type StatusBadgeProps = {
  status: string;
};

function statusToVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
    case "planned":
      return "default";
    case "closed":
    case "in_progress":
      return "secondary";
    case "resolved":
    case "completed":
      return "outline";
    case "cancelled":
    case "dropped":
    case "archived":
      return "destructive";
    default:
      return "secondary";
  }
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant={statusToVariant(status)}>{status.replace(/_/g, " ")}</Badge>
  );
}
