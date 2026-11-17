-- Audit entries for explicit merchant reconciliation. No production data is modified by this migration file alone.
CREATE TABLE `ToolOrderReconcileEvent` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(32) NOT NULL,
    `operatorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(16) NOT NULL,
    `observed` VARCHAR(16) NOT NULL,
    `outcome` VARCHAR(24) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ToolOrderReconcileEvent_orderId_createdAt_idx`(`orderId`, `createdAt`),
    INDEX `ToolOrderReconcileEvent_operatorId_createdAt_idx`(`operatorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ToolOrderReconcileEvent`
    ADD CONSTRAINT `ToolOrderReconcileEvent_orderId_fkey`
    FOREIGN KEY (`orderId`) REFERENCES `ToolOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ToolOrderReconcileEvent`
    ADD CONSTRAINT `ToolOrderReconcileEvent_operatorId_fkey`
    FOREIGN KEY (`operatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
