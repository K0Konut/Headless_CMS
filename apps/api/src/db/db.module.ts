import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
import { createDb, type Db } from './index.js'

export const DB = Symbol('DB')

@Global()
@Module({
  providers: [{ provide: DB, useFactory: () => createDb() }],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  onApplicationShutdown() {
    return this.db.$client.end()
  }
}
