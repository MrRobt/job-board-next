-- B04/U03 audit failed notification claim attempts atomically with status CAS.
-- Never store claimToken, personal data or external delivery details.
CREATE TABLE `OpsNotificationFailureEvent` (
 `id` VARCHAR(191) NOT NULL,
 `intentKey` CHAR(64) NOT NULL,
 `attemptCount` INTEGER NOT NULL,
 `disposition` VARCHAR(16) NOT NULL,
 `failureCode` VARCHAR(40) NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE INDEX `OpsNotificationFailureEvent_intentKey_attemptCount_key`(`intentKey`,`attemptCount`),
 INDEX `OpsNotificationFailureEvent_createdAt_idx`(`createdAt`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OpsNotificationFailureEvent`
 ADD CONSTRAINT `OpsNotificationFailureEvent_intentKey_fkey`
 FOREIGN KEY (`intentKey`) REFERENCES `OpsIncidentNotificationIntent`(`idempotencyKey`)
 ON DELETE RESTRICT ON UPDATE CASCADE;
