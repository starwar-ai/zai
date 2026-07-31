import { forwardRef, type HTMLAttributes, type ReactNode, type TableHTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react"
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react"
import { Button } from "./button"
import { cn } from "./utils"

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) { return <div className="ui-table-scroll"><table className={cn("ui-table", className)} {...props} /></div> }
export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) { return <thead {...props} /> }
export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) { return <tbody {...props} /> }
export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(function TableRow({ className, ...props }, ref) { return <tr ref={ref} className={cn("ui-table-row", className)} {...props} /> })
export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(function TableHead({ className, ...props }, ref) { return <th ref={ref} className={cn("ui-table-head", className)} {...props} /> })
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) { return <td className={cn("ui-table-cell", className)} {...props} /> }

interface PaginationProps { page: number; pageCount: number; total: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange?: (pageSize: number) => void; pageSizeOptions?: number[]; extra?: ReactNode }
export function Pagination({ page, pageCount, total, pageSize, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50, 100], extra }: PaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return <div className="ui-pagination"><span>共 <strong>{total}</strong> 条{total > 0 && `，显示 ${start}-${end}`}</span>{extra}<div>{onPageSizeChange && <label className="ui-page-size">每页<select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>{pageSizeOptions.map((size) => <option key={size} value={size}>{size} 条</option>)}</select></label>}{!onPageSizeChange && <span>每页 {pageSize} 条</span>}<b>{page} / {pageCount} 页</b><Button size="sm" aria-label="第一页" title="首页" disabled={page <= 1} onClick={() => onPageChange(1)}><ChevronsLeft /></Button><Button size="sm" aria-label="上一页" title="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft /></Button><Button size="sm" aria-label="下一页" title="下一页" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight /></Button><Button size="sm" aria-label="最后一页" title="末页" disabled={page >= pageCount} onClick={() => onPageChange(pageCount)}><ChevronsRight /></Button></div></div>
}
