CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text,
	`item` text,
	`discount_text` text,
	`discount_pct` real,
	`price` real,
	`currency` text,
	`code` text,
	`min_spend` real,
	`url` text,
	`source_alias` text,
	`dedup_hash` text NOT NULL,
	`starts_at` integer,
	`expires_at` integer,
	`raw_excerpt` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deals_dedup_hash_unique` ON `deals` (`dedup_hash`);--> statement-breakpoint
CREATE TABLE `ingest_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer,
	`messages_seen` integer DEFAULT 0 NOT NULL,
	`deals_added` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_name_unique` ON `merchants` (`name`);--> statement-breakpoint
CREATE TABLE `tracking_prefs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracking_prefs_kind_scope_value` ON `tracking_prefs` (`kind`,`scope`,`value`);