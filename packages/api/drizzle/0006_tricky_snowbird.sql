CREATE TABLE `pantry_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`coupon_type_id` text,
	`image_url` text,
	`size_amount` real,
	`size_unit` text,
	`unit_price_unit` text NOT NULL,
	`target_price` real,
	`notes` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`coupon_type_id`) REFERENCES `coupon_types`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `price_entries` (
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
	`observed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`pantry_item_id`) REFERENCES `pantry_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `price_entries_item_observed` ON `price_entries` (`pantry_item_id`,`observed_at`);