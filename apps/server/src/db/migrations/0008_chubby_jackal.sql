CREATE TABLE `growth_target` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`target_date` text NOT NULL,
	`weight_min_g` integer,
	`weight_max_g` integer,
	`length_min_mm` integer,
	`length_max_mm` integer,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`rev` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_target_child_date_unique` ON `growth_target` (`child_id`,`target_date`) WHERE "growth_target"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `growth_target_family_rev_idx` ON `growth_target` (`family_id`,`rev`);