import "dotenv/config"
import { createApp } from "./app.js"
import { connectDatabase, disconnectDatabase } from "./database.js"

const port = Number(process.env.PORT || 3100)

await connectDatabase()
const server = createApp().listen(port, () => console.log(`ZForm 服务已启动：http://localhost:${port}`))

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => { disconnectDatabase().finally(() => process.exit(0)) }))
}
