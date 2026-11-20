-- P0 B06: second-person internal approval ONLY; does not send a merchant refund.
ALTER TABLE `ToolRefundIntent`
 ADD COLUMN `approvedById` VARCHAR(191) NULL,
 ADD COLUMN `approvalReason` VARCHAR(500) NULL,
 ADD COLUMN `approvedAt` DATETIME(3) NULL;

ALTER TABLE `ToolRefundIntent` MODIFY `state`
 ENUM('PREPARED','APPROVED') NOT NULL DEFAULT 'PREPARED';

CREATE INDEX `ToolRefundIntent_approvedById_approvedAt_idx` ON `ToolRefundIntent`(`approvedById`,`approvedAt`);

ALTER TABLE `ToolRefundIntent`
 ADD CONSTRAINT `ToolRefundIntent_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
