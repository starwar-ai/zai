import { AppLayout } from "@/components/app-layout"
import { registerDefaultPlugins } from "@/registrations/default-plugins"

registerDefaultPlugins()

export default function App() {
  return <AppLayout />
}
