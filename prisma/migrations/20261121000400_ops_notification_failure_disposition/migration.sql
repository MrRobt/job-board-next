-- B04/U03 internal failure scheduling only. No outbound notification is enabled.
ALTER TABLE `OpsIncidentNotificationIntent`
 MODIFY COLUMN `state` ENUM('QUEUED','CLAIMED','RETRY_WAIT','DEAD') NOT NULL DEFAULT 'QUEUED',
 ADD COLUMN `nextAttemptAt` DATETIME(3) NULL,
 ADD COLUMN `failureCode` VARCHAR(40) NULL,
 ADD INDEX `OpsIncidentNotificationIntent_state_nextAttemptAt_idx`(`state`,`nextAttemptAt`);
