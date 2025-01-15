import { rejectedPromiseHandler } from '@activepieces/server-shared'
import { ActivepiecesError, ApEdition, CreateTrialLicenseKeyRequestBody, ErrorCode, isNil, LicenseKeyEntity, PackageType, PlatformRole, TelemetryEventName, UserStatus } from '@activepieces/shared'
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

// Create a constant for enabled Enterprise features
const alwaysEnabledFeatures = {
    ssoEnabled: true,
    analyticsEnabled: true,
    environmentsEnabled: true,
    showPoweredBy: false,
    embeddingEnabled: true,
    auditLogEnabled: true,
    customAppearanceEnabled: true,
    manageProjectsEnabled: true,
    managePiecesEnabled: true,
    manageTemplatesEnabled: true,
    apiKeysEnabled: true,
    customDomainsEnabled: true,
    globalConnectionsEnabled: true,
    customRolesEnabled: true,
    projectRolesEnabled: true,
    flowIssuesEnabled: true,
    alertsEnabled: true
}

export const licenseKeysService = (log: FastifyBaseLogger) => ({
    async requestTrial(request: CreateTrialLicenseKeyRequestBody): Promise<void> {
        const response = await fetch(secretManagerLicenseKeysRoute, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        })
        if (response.status === StatusCodes.CONFLICT) {
            throw new ActivepiecesError({
                code: ErrorCode.EMAIL_ALREADY_HAS_ACTIVATION_KEY,
                params: request,
            })
        }
        if (!response.ok) {
            const errorMessage = JSON.stringify(await response.json())
            handleUnexpectedSecretsManagerError(log, errorMessage)
        }
    },
    async markAsActiviated(request: { key: string, platformId: string }): Promise<void> {
        try {
            const response = await fetch(`${secretManagerLicenseKeysRoute}/activate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            })
            if (response.status === StatusCodes.CONFLICT) {
                return
            }
            if (response.status === StatusCodes.NOT_FOUND) {
                return
            }
            if (!response.ok) {
                const errorMessage = JSON.stringify(await response.json())
                handleUnexpectedSecretsManagerError(log, errorMessage)
            }
            rejectedPromiseHandler(telemetry(log).trackPlatform(request.platformId, {
                name: TelemetryEventName.KEY_ACTIVIATED,
                payload: {
                    date: dayjs().toISOString(),
                    key: request.key,
                },
            }), log)
        }
        catch (e) {
            // ignore
        }
    },
    async getKey(license: string | undefined): Promise<LicenseKeyEntity | null> {
        if (isNil(license)) {
            return null
        }
        const response = await fetch(`${secretManagerLicenseKeysRoute}/${license}`)
        if (response.status === StatusCodes.NOT_FOUND) {
            return null
        }
        if (!response.ok) {
            const errorMessage = JSON.stringify(await response.json())
            handleUnexpectedSecretsManagerError(log, errorMessage)
        }
        return response.json()
    },
    async verifyKeyOrReturnNull({ platformId, license }: { license: string | undefined, platformId: string }): Promise<LicenseKeyEntity | null  > {
        return {
            id: '1',
            key: license || 'ENTERPRISE',
            createdAt: new Date().toISOString(),
            expiresAt: '2099-12-31T23:59:59.999Z',
            activatedAt: new Date().toISOString(),
            isTrial: false,
            email: 'enterprise@activepieces.com',
            ssoEnabled: true,
            environmentsEnabled: true,
            showPoweredBy: false,
            embeddingEnabled: true,
            auditLogEnabled: true,
            customAppearanceEnabled: true,
            globalConnectionsEnabled: true,
            customRolesEnabled: true,
            manageProjectsEnabled: true,
            managePiecesEnabled: true,
            manageTemplatesEnabled: true,
            apiKeysEnabled: true,
            customDomainsEnabled: true,
            projectRolesEnabled: true,
            flowIssuesEnabled: true,
            alertsEnabled: true,
            analyticsEnabled: true,
        }
    },
    async downgradeToFreePlan(platformId: string): Promise<void> {
        await platformService.update({
            id: platformId,
            ...turnedOffFeatures,
        })
        await deactivatePlatformUsersOtherThanAdmin(platformId)
        await deletePrivatePieces(platformId, log)
    },
    async applyLimits(platformId: string, key?: LicenseKeyEntity): Promise<void> {
        await platformService.update({
            id: platformId,
            ...alwaysEnabledFeatures,
            ...(key || {})
        })
    },
})

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
