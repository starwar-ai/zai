import { CircleCheck, Database, UserRound } from "lucide-react"
import type { ShellUser } from "@zform/shared"


export function GlobalStatusBar({ user, tabCount }: { user: ShellUser; tabCount: number }) {
  return <footer className="global-status-bar"><span><CircleCheck />服务正常</span><span><Database />PostgreSQL</span><span>工作区 {tabCount} 个标签</span><span className="status-spacer" /><span><UserRound />{user.name} · {user.departmentName}</span><span>Framework 0.1.0</span></footer>
}
