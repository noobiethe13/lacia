import { cn } from "@/lib/utils";

interface TerminalProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export function Terminal({ className, title = "Trace Output", children, ...props }: TerminalProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card font-mono text-sm overflow-hidden", className)} {...props}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
          </div>
          <span className="ml-2 text-xs text-muted-foreground font-medium">{title}</span>
        </div>
      </div>
      <div className="p-4 overflow-x-auto">
        <div className="min-w-full text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}
