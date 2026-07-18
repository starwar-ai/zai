import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react"
import { cn } from "./utils"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) { return <input ref={ref} className={cn("ui-input", className)} {...props} /> })
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) { return <textarea ref={ref} className={cn("ui-textarea", className)} {...props} /> })
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) { return <select ref={ref} className={cn("ui-select", className)} {...props} /> })
export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(function Checkbox({ className, ...props }, ref) { return <input ref={ref} type="checkbox" className={cn("ui-checkbox", className)} {...props} /> })
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) { return <label className={cn("ui-label", className)} {...props} /> }

interface FormFieldProps {
  label: string
  required?: boolean
  hint?: string
  error?: string
  htmlFor?: string
  children: ReactNode
  className?: string
}

export function FormField({ label, required, hint, error, htmlFor, children, className }: FormFieldProps) {
  return <div className={cn("ui-form-field", className)}><Label htmlFor={htmlFor}>{label}{required && <i>*</i>}</Label>{children}{error ? <small className="ui-field-error">{error}</small> : hint ? <small>{hint}</small> : null}</div>
}
