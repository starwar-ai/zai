import { AppLayout } from "@/components/app-layout"
import { registerDefaultPlugins } from "@/registrations/default-plugins"
import { registerCustomerResearchPlugins } from "@/registrations/customer-research-plugins"

registerDefaultPlugins()
registerCustomerResearchPlugins()

export default function App() {
  return <AppLayout />
}
