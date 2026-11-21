-- B04/U03 durable QUEUED notification intents only.
-- No sender, dispatcher, retries or external service calls are enabled.
CREATE TABLE `OpsIncidentNotificationIntent` (
  `idempotencyKey` CHAR(64) NOT NULL,
  `incidentKey` VARCHAR(40) NOT NULL,
  `episodeOpenedAt` DATETIME(3) NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `priority` VARCHAR(8) NOT NULL,
  `dueBucket` INTEGER NOT NULL,
  `count` INTEGER NOT NULL,
  `state` ENUM('QUEUED') NOT NULL DEFAULT 'QUEUED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `OpsIncidentNotificationIntent_state_createdAt_idx` (`state`,`createdAt`),
  INDEX `OpsIncidentNotificationIntent_incidentKey_episodeOpenedAt_idx` (`incidentKey`,`episodeOpenedAt`),
  PRIMARY KEY (`idempotencyKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OpsIncidentNotificationIntent`
 ADD CONSTRAINT `OpsIncidentNotificationIntent_incidentKey_fkey`
 FOREIGN KEY (`incidentKey`) REFERENCES `OpsAlertIncident`(`key`)
 ON DELETE RESTRICT ON UPDATE CASCADE;
