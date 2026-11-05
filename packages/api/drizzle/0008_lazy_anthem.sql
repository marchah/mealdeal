PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_price_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`pantry_item_id` text NOT NULL,
	`merchant_id` text,
	`price` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`size_amount` real NOT NULL,
	`size_unit` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price` real NOT NULL,
	`on_sale` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	`url` text,
	`note` text,
	`receipt_id` text,
	`observed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`pantry_item_id`) REFERENCES `pantry_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_price_entries`("id", "pantry_item_id", "merchant_id", "price", "currency", "size_amount", "size_unit", "quantity", "unit_price", "on_sale", "source", "url", "note", "receipt_id", "observed_at", "created_at") SELECT "id", "pantry_item_id", "merchant_id", "price", "currency", "size_amount", "size_unit", "quantity", "unit_price", "on_sale", "source", "url", "note", "receipt_id", "observed_at", "created_at" FROM `price_entries`;--> statement-breakpoint
DROP TABLE `price_entries`;--> statement-breakpoint
ALTER TABLE `__new_price_entries` RENAME TO `price_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `price_entries_item_observed` ON `price_entries` (`pantry_item_id`,`observed_at`);