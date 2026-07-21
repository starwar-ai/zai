import type { HTMLAttributes } from "react"
import { cn } from "./utils"

export function Separator({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn("ui-separator", className)} {...props} />
}

interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  value?: number
  max?: number
  label?: string
}

export function Progress({ value = 0, max = 100, label, className, ...props }: ProgressProps) {
  const safeMax = max > 0 ? max : 100
  const percentage = Math.min(100, Math.max(0, (value / safeMax) * 100))
  return <div className={cn("ui-progress", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={value} {...props}><span style={{ width: `${percentage}%` }} /></div>
}
