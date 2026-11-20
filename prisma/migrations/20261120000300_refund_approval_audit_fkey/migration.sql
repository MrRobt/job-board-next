-- Preserve immutable finance approval audit identity after an admin account is removed.
-- Applies after the original, already executed approval migration.
ALTER TABLE `ToolRefundIntent` DROP FOREIGN KEY `ToolRefundIntent_approvedById_fkey`;
ALTER TABLE `ToolRefundIntent`
 ADD CONSTRAINT `ToolRefundIntent_approvedById_fkey`
 FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`)
 ON DELETE RESTRICT ON UPDATE CASCADE;
