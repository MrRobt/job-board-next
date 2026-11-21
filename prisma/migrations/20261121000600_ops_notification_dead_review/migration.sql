-- Internal DEAD review only: immutable one-per-task audit, no dispatch or retry.
CREATE TABLE `OpsNotificationDeadReview` (
 `intentKey` CHAR(64) NOT NULL,
 `operatorId` VARCHAR(191) NOT NULL,
 `reasonCode` VARCHAR(40) NOT NULL,
 `reviewedAt` DATETIME(3) NOT NULL,
 INDEX `OpsNotificationDeadReview_operatorId_reviewedAt_idx`(`operatorId`,`reviewedAt`),
 PRIMARY KEY (`intentKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `OpsNotificationDeadReview`
 ADD CONSTRAINT `OpsNotificationDeadReview_intentKey_fkey`
 FOREIGN KEY (`intentKey`) REFERENCES `OpsIncidentNotificationIntent`(`idempotencyKey`)
 ON DELETE RESTRICT ON UPDATE CASCADE;
