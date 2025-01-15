import { exceptionHandler } from '@activepieces/server-shared'
import { isEmpty, isNil } from '@activepieces/shared'
import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { systemJobsSchedule } from '../../helper/system-jobs'
import { SystemJobName } from '../../helper/system-jobs/common'
import { systemJobHandlers } from '../../helper/system-jobs/job-handlers'
import { platformService } from '../../platform/platform.service'
import { licenseKeysController } from './license-keys-controller'
import { licenseKeysService } from './license-keys-service'

export const licenseKeysModule: FastifyPluginAsyncTypebox = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.TRIAL_TRACKER, async () => {
        const platforms = await platformService.getAll()
        for (const platform of platforms) {
            if (isNil(platform.licenseKey) || isEmpty(platform.licenseKey)) {
                continue
            }
            try {
                const key = await licenseKeysService(app.log).verifyKeyOrReturnNull({
                    platformId: platform.id,
                    license: platform.licenseKey,
                })
                if (isNil(key)) {
                    await licenseKeysService(app.log).downgradeToFreePlan(platform.id)
                    continue
                }
                await licenseKeysService(app.log).applyLimits(platform.id) // Remove second argument
            }
            catch (e) {
                exceptionHandler.handle(e, app.log)
            }
        }
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.TRIAL_TRACKER,
            data: {},
        },
        schedule: {
            type: 'repeated',
            cron: '*/59 23 * * *',
        },
    })
    await app.register(licenseKeysController, { prefix: '/v1/license-keys' })
}