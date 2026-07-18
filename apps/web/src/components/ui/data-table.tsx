import type { HTMLAttributes, ReactNode, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "./button"
import { cn } from "./utils"

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) { return <div className="ui-table-scroll"><table className={cn("ui-table", className)} {...props} /></div> }
export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) { return <thead {...props} /> }
export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) { return <tbody {...props} /> }
export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) { return <tr className={cn("ui-table-row", className)} {...props} /> }
export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) { return <th className={cn("ui-table-head", className)} {...props} /> }
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) { return <td className={cn("ui-table-cell", className)} {...props} /> }

interface PaginationProps { page: number; pageCount: number; total: number; pageSize: number; onPageChange: (page: number) => void; extra?: ReactNode }
export function Pagination({ page, pageCount, total, pageSize, onPageChange, extra }: PaginationProps) { return <div className="ui-pagination"><span>共 {total} 条，每页 {pageSize} 条</span>{extra}<div><Button size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft />上一页</Button><b>{page} / {pageCount}</b><Button size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页<ChevronRight /></Button></div></div> }
