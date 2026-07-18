import { forwardRef, type ButtonHTMLAttributes } from "react"
import { LoaderCircle } from "lucide-react"
import { cn } from "./utils"

export type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "ghost"
export type ButtonSize = "sm" | "md" | "icon"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "primary-button", secondary: "secondary-button", success: "success-button",
  danger: "danger-ghost-button", ghost: "ui-ghost-button",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading = false, className, children, disabled, type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={cn("ui-button", variantClasses[variant], size === "sm" && "ui-button-sm", size === "icon" && "icon-button", className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading && <LoaderCircle className="spin" />}{children}</button>
})

export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "size">>(function IconButton({ variant = "ghost", className, ...props }, ref) {
  return <Button ref={ref} variant={variant} size="icon" className={className} {...props} />
})
