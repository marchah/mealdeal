CREATE TABLE `receipt_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`match_key` text NOT NULL,
	`printed_text` text NOT NULL,
	`pantry_item_id` text,
	`size_amount` real,
	`size_unit` text,
	`ignored` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pantry_item_id`) REFERENCES `pantry_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_aliases_merchant_match_key` ON `receipt_aliases` (`merchant_id`,`match_key`);--> statement-breakpoint
CREATE TABLE `receipt_images` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`position` integer NOT NULL,
	`path` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_images_receipt_position` ON `receipt_images` (`receipt_id`,`position`);--> statement-breakpoint
CREATE TABLE `receipt_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`position` integer NOT NULL,
	`item_number` text,
	`printed_text` text NOT NULL,
	`description` text,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price` real,
	`weight` real,
	`weight_unit` text,
	`line_total` real NOT NULL,
	`discount` real,
	`tax_flag` text,
	`flags` text DEFAULT '[]' NOT NULL,
	`pantry_item_id` text,
	`size_amount` real,
	`size_unit` text,
	`match_source` text,
	`decision` text NOT NULL,
	`price_entry_id` text,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pantry_item_id`) REFERENCES `pantry_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`price_entry_id`) REFERENCES `price_entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_lines_receipt_position` ON `receipt_lines` (`receipt_id`,`position`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text,
	`purchased_at` integer,
	`status` text NOT NULL,
	`failed_stage` text,
	`error` text,
	`ocr_text` text,
	`ocr_engine` text,
	`subtotal` real,
	`tax` real,
	`total` real,
	`image_hash` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `price_entries` ADD `receipt_id` text;