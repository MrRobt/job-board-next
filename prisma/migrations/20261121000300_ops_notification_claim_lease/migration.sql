-- B04/U03 internal-only notification lease claims. NO sender or delivery enabled.
ALTER TABLE `OpsIncidentNotificationIntent`
 MODIFY COLUMN `state` ENUM('QUEUED','CLAIMED') NOT NULL DEFAULT 'QUEUED',
 ADD COLUMN `attemptCount` INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN `claimToken` VARCHAR(36) NULL,
 ADD COLUMN `claimedAt` DATETIME(3) NULL,
 ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL,
 ADD INDEX `OpsIncidentNotificationIntent_state_leaseExpiresAt_idx` (`state`,`leaseExpiresAt`);
