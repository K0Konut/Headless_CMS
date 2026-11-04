import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module.js'
import { setupApp } from './app.setup.js'

const app = setupApp(await NestFactory.create<NestExpressApplication>(AppModule))
app.enableShutdownHooks()
await app.listen(process.env.PORT ?? 3000)
