-- B04/U03 operational incident state and append-only event audit.
-- No payment, credit, refund or user ledger tables are altered.
CREATE TABLE `OpsAlertIncident` (
  `key` VARCHAR(40) NOT NULL,
  `state` ENUM('OPEN','ACKNOWLEDGED','RESOLVED') NOT NULL DEFAULT 'OPEN',
  `count` INTEGER NOT NULL,
  `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `acknowledgedAt` DATETIME(3) NULL,
  `acknowledgedById` VARCHAR(191) NULL,
  `acknowledgmentNote` VARCHAR(500) NULL,
  `resolvedAt` DATETIME(3) NULL,
  INDEX `OpsAlertIncident_state_lastSeenAt_idx`(`state`, `lastSeenAt`),
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OpsAlertIncidentEvent` (
  `id` VARCHAR(191) NOT NULL,
  `incidentKey` VARCHAR(40) NOT NULL,
  `action` VARCHAR(20) NOT NULL,
  `count` INTEGER NOT NULL,
  `operatorId` VARCHAR(191) NULL,
  `note` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `OpsAlertIncidentEvent_incidentKey_createdAt_idx`(`incidentKey`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OpsAlertIncident`
 ADD CONSTRAINT `OpsAlertIncident_acknowledgedById_fkey`
 FOREIGN KEY (`acknowledgedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OpsAlertIncidentEvent`
 ADD CONSTRAINT `OpsAlertIncidentEvent_incidentKey_fkey`
 FOREIGN KEY (`incidentKey`) REFERENCES `OpsAlertIncident`(`key`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OpsAlertIncidentEvent`
 ADD CONSTRAINT `OpsAlertIncidentEvent_operatorId_fkey`
 FOREIGN KEY (`operatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
