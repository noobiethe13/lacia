import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "destructive" | "neutral" | "info";
  animate?: boolean;
}

export function Badge({ 
  className, 
  variant = "default", 
  animate = false,
  children,
  ...props 
}: BadgeProps) {
  const variants = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    destructive: "bg-red-500/10 text-red-400 border-red-500/20",
    neutral: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    >
      {animate && (
        <span className="relative flex h-2 w-2 mr-2">
          <span className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            variant === "success" ? "bg-emerald-400" : 
            variant === "warning" ? "bg-amber-400" :
            variant === "destructive" ? "bg-red-400" :
            variant === "info" ? "bg-blue-400" : "bg-gray-400"
          )}></span>
          <span className={cn(
            "relative inline-flex rounded-full h-2 w-2",
            variant === "success" ? "bg-emerald-500" : 
            variant === "warning" ? "bg-amber-500" :
            variant === "destructive" ? "bg-red-500" :
            variant === "info" ? "bg-blue-500" : "bg-gray-500"
          )}></span>
        </span>
      )}
      {children}
    </span>
  );
}
