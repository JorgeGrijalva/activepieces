import { rejectedPromiseHandler } from '@activepieces/server-shared'
import { 
  ActivepiecesError, 
  ApEdition,
  CreateTrialLicenseKeyRequestBody, 
  ErrorCode,
  isNil,
  LicenseKeyEntity,
  PackageType,
  PlatformRole,
  TelemetryEventName,
  UserStatus
} from '@activepieces/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { flagService } from '../../flags/flag.service'
import { telemetry } from '../../helper/telemetry.utils'
import { pieceMetadataService } from '../../pieces/piece-metadata-service'
import { platformService } from '../../platform/platform.service'
import { userService } from '../../user/user-service'

const secretManagerLicenseKeysRoute = 'https://secrets.activepieces.com/license-keys'

const handleUnexpectedSecretsManagerError = (log: FastifyBaseLogger, message: string) => {
    log.error(`[ERROR]: Unexpected error from secret manager: ${message}`)
    throw new Error(message)
}

export const licenseKeysService = (log: FastifyBaseLogger) => ({
    async requestTrial(request: CreateTrialLicenseKeyRequestBody): Promise<void> {
        return Promise.resolve()
    },

    async markAsActiviated(request: { key: string, platformId: string }): Promise<void> {
        return Promise.resolve()
    },

    async getKey(key: string): Promise<LicenseKeyEntity | null> {
        return this.getLicenseKey()
    },

    async verifyKeyOrReturnNull({ platformId, license }: { platformId: string, license: string }): Promise<LicenseKeyEntity | null> {
        return this.getLicenseKey()
    },

    async applyLimits(platformId: string, key: LicenseKeyEntity): Promise<void> {
        return Promise.resolve()
    },

    async downgradeToFreePlan(platformId: string): Promise<void> {
        return Promise.resolve()
    },

    async getLicenseKey(): Promise<LicenseKeyEntity> {
        return {
            id: 'enterprise-license',
            key: 'ENTERPRISE-ALWAYS-VALID', 
            edition: ApEdition.ENTERPRISE,
            expirationDate: dayjs().add(100, 'years').toISOString(),
            activationDate: dayjs().toISOString(),
            email: 'enterprise@local.dev',
            created: dayjs().toISOString(),
            updated: dayjs().toISOString(),
            isTrial: false,
            environmentsEnabled: true,
            analyticsEnabled: true,
            showPoweredBy: false,
            auditLogEnabled: true,
            embeddingEnabled: true,
            managePiecesEnabled: true,
            manageProjectsEnabled: true,
            projectRolesEnabled: true,
            customDomainsEnabled: true,
            apiKeysEnabled: true,
            flowIssuesEnabled: true,
            alertsEnabled: true,
            ssoEnabled: true,
            customAppearanceEnabled: true,
            manageTemplatesEnabled: true,
            customRolesEnabled: true,
            globalConnectionsEnabled: true
        }
    }
})

// Opcional: También puedes mockear el flag service para asegurar features enterprise
flagService.override('enterprise', true);

const deactivatePlatformUsersOtherThanAdmin: (platformId: string) => Promise<void> = async (platformId: string) => {
    const { data } = await userService.list({
        platformId,
    })
    const users = data.filter(f => f.platformRole !== PlatformRole.ADMIN).map(u => {
        return userService.update({
            id: u.id,
            status: UserStatus.INACTIVE,
            platformId,
            platformRole: u.platformRole,
        })
    })
    await Promise.all(users)
}


const deletePrivatePieces = async (platformId: string, log: FastifyBaseLogger): Promise<void> => {
    const latestRelease = await flagService.getCurrentRelease()
    const pieces = await pieceMetadataService(log).list({
        edition: ApEdition.ENTERPRISE,
        includeHidden: true,
        release: latestRelease,
        platformId,
    })
    const piecesToDelete = pieces.filter((piece) => piece.packageType === PackageType.ARCHIVE && piece.id).map((piece) =>
        pieceMetadataService(log).delete({
            id: piece.id!,
            projectId: piece.projectId,
        }),
    )
    await Promise.all(piecesToDelete)
}


const turnedOffFeatures: Omit<LicenseKeyEntity, 'id' | 'createdAt' | 'expiresAt' | 'activatedAt' | 'isTrial' | 'email' | 'customerName' | 'key'> = {
    ssoEnabled: false,
    analyticsEnabled: false,
    environmentsEnabled: false,
    showPoweredBy: false,
    embeddingEnabled: false,
    auditLogEnabled: false,
    customAppearanceEnabled: false,
    manageProjectsEnabled: false,
    managePiecesEnabled: false,
    manageTemplatesEnabled: false,
    apiKeysEnabled: false,
    customDomainsEnabled: false,
    globalConnectionsEnabled: false,
    customRolesEnabled: false,
    projectRolesEnabled: false,
    flowIssuesEnabled: false,
    alertsEnabled: false,
}
