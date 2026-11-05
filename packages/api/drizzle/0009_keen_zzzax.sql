ALTER TABLE `receipts` ADD `flags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_image_hash` ON `receipts` (`image_hash`);