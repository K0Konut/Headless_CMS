import { Body, Controller, Get, HttpCode, Post, Put, Req, UseGuards } from '@nestjs/common'
import { deploySettingsSchema } from '@dashility/shared'
import { SuperAdminGuard } from '../auth/session.guard.js'
import { type SpaceRequest, SpaceAccessGuard } from '../spaces/guards.js'
import { DeployService } from './deploy.service.js'

/** Déploiement d'un espace. Seul le super-admin règle l'URL et le jeton ; tout membre voit
 *  l'état du dernier appel et peut le relancer, puisqu'il publie (document UX, « Déploiement »). */
@Controller('spaces/:slug/deploy')
@UseGuards(SpaceAccessGuard)
export class DeployController {
  constructor(private readonly deploy: DeployService) {}

  @Get()
  state(@Req() { space, user }: SpaceRequest) {
    return this.deploy.state(space, user.isSuperAdmin)
  }

  @Put()
  @UseGuards(SuperAdminGuard)
  async configure(@Req() { space, user }: SpaceRequest, @Body() body: unknown) {
    await this.deploy.configure(space, deploySettingsSchema.parse(body))
    return this.deploy.state(space, user.isSuperAdmin)
  }

  /** Lance un déploiement tout de suite et renvoie son résultat (10 s au plus). */
  @Post()
  @HttpCode(200)
  async callNow(@Req() { space, user }: SpaceRequest) {
    await this.deploy.callNow(space)
    return this.deploy.state(space, user.isSuperAdmin)
  }
}
