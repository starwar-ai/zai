import type { ReactNode } from "react"
import { cn } from "./utils"

export interface TabOption { id: string; label: ReactNode; disabled?: boolean }
export function Tabs({ items, value, onChange, className }: { items: TabOption[]; value: string; onChange: (value: string) => void; className?: string }) { return <div className={cn("ui-tabs", className)} role="tablist">{items.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === value} className={item.id === value ? "active" : ""} disabled={item.disabled} onClick={() => onChange(item.id)}>{item.label}</button>)}</div> }
export function TabPanel({ active, children, className }: { active: boolean; children: ReactNode; className?: string }) { return <div role="tabpanel" hidden={!active} className={className}>{children}</div> }
