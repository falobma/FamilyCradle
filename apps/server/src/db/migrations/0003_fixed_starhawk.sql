CREATE TABLE `child` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`nickname` text,
	`sex` text NOT NULL,
	`date_of_birth` text NOT NULL,
	`time_of_birth` text,
	`gestational_age_weeks` integer,
	`gestational_age_days` integer,
	`birth_weight_g` integer NOT NULL,
	`birth_length_mm` integer,
	`birth_head_circ_mm` integer,
	`feeding_mode` text DEFAULT 'mixed' NOT NULL,
	`milk_target_mode` text DEFAULT 'auto' NOT NULL,
	`milk_target_manual_ml` integer,
	`allergies_note` text,
	`avatar` text DEFAULT 'initials' NOT NULL,
	`color` text DEFAULT 'sage' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`rev` integer DEFAULT 1 NOT NULL,
	`deleted_at` text,
	`purge_after` text,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `child_family_order_idx` ON `child` (`family_id`,`deleted_at`,`sort_order`);--> statement-breakpoint
CREATE TABLE `family` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text NOT NULL,
	`pumping_side_mode` text DEFAULT 'combined' NOT NULL,
	`ai_consent` integer DEFAULT false NOT NULL,
	`ai_consent_by` text,
	`ai_consent_at` text,
	`quick_bottle_ml` text DEFAULT '[60,90,120,150]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`rev` integer DEFAULT 1 NOT NULL,
	`deleted_at` text,
	`purge_after` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `family_invite` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`target_role` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_by` text,
	`used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_invite_code_hash_unique` ON `family_invite` (`code_hash`);--> statement-breakpoint
CREATE INDEX `family_invite_family_idx` ON `family_invite` (`family_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `family_member` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL,
	`removed_at` text,
	`removed_by` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`rev` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`removed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_member_active_unique` ON `family_member` (`family_id`,`user_id`) WHERE "family_member"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX `family_member_user_idx` ON `family_member` (`user_id`,`removed_at`);--> statement-breakpoint
CREATE INDEX `family_member_family_idx` ON `family_member` (`family_id`,`removed_at`);--> statement-breakpoint
CREATE TABLE `family_rev_counter` (
	`family_id` text PRIMARY KEY NOT NULL,
	`rev` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invite_rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_started_at` integer NOT NULL
);
