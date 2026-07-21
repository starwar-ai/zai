import { useCallback, useEffect, useState } from "react"
import { Building2, MenuSquare, RefreshCw, ShieldCheck, Users } from "lucide-react"
import type { SystemManagementData } from "@zform/shared"
import { api } from "@/apis/framework-api"
import { DepartmentManagement } from "@/components/system-management/department-management"
import { MenuManagement } from "@/components/system-management/menu-management"
import { RoleManagement } from "@/components/system-management/role-management"
import { UserManagement } from "@/components/system-management/user-management"
import { Alert, Button, Card, PageHeader, Spinner } from "@/components/ui"

type Entity = "menus" | "users" | "roles" | "departments"
interface SystemManagementProps { entity: Entity; onShellChanged: () => Promise<void> }

const EMPTY_DATA: SystemManagementData = { menus: [], roles: [], users: [], departments: [] }
const entityMeta = {
  menus: { title: "菜单管理", description: "配置应用导航、访问目标、权限码和显示顺序。", icon: MenuSquare },
  users: { title: "用户管理", description: "管理登录主体、所属部门、启停状态和角色分配。", icon: Users },
  roles: { title: "角色管理", description: "按角色组合系统权限和业务单据操作权限。", icon: ShieldCheck },
  departments: { title: "部门管理", description: "维护组织层级，用户和数据权限统一引用部门标识。", icon: Building2 },
}

export function SystemManagement({ entity, onShellChanged }: SystemManagementProps) {
  const [data, setData] = useState<SystemManagementData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const meta = entityMeta[entity]
  const load = useCallback(async () => { setLoading(true); setError(null); try { setData(await api.systemManagement()) } catch (reason) { setError(reason instanceof Error ? reason.message : "加载失败") } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  const changed = async () => { await Promise.all([load(), onShellChanged()]) }

  return <><PageHeader eyebrow="系统管理 / RBAC" title={meta.title} description={meta.description} actions={<Button onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} />刷新</Button>} />
    {error && <Alert variant="danger">{error}</Alert>}
    {loading && data.menus.length === 0 ? <Card className="management-loading"><Spinner label="正在加载系统管理数据..." /></Card> : <>
      {entity === "menus" && <MenuManagement menus={data.menus} onChanged={changed} onError={setError} />}
      {entity === "departments" && <DepartmentManagement departments={data.departments} onChanged={changed} onError={setError} />}
      {entity === "roles" && <RoleManagement roles={data.roles} menus={data.menus} onChanged={changed} onError={setError} />}
      {entity === "users" && <UserManagement users={data.users} roles={data.roles} departments={data.departments} onChanged={changed} onError={setError} />}
    </>}
  </>
}
