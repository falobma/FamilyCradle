CREATE TABLE `child_milestone` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`definition_id` text NOT NULL,
	`achieved` integer DEFAULT false NOT NULL,
	`achieved_on` text,
	`note` text,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`rev` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`) REFERENCES `milestone_definition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `child_milestone_child_definition_unique` ON `child_milestone` (`child_id`,`definition_id`);--> statement-breakpoint
CREATE INDEX `child_milestone_family_rev_idx` ON `child_milestone` (`family_id`,`rev`);--> statement-breakpoint
CREATE TABLE `child_vaccine` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`definition_id` text,
	`vaccine_code` text NOT NULL,
	`custom_name` text,
	`dose_label_id` text NOT NULL,
	`dose_label_en` text NOT NULL,
	`category` text NOT NULL,
	`due_date` text NOT NULL,
	`window_end_date` text NOT NULL,
	`given_date` text,
	`given_place` text,
	`batch_number` text,
	`note` text,
	`status_override` text,
	`is_custom` integer DEFAULT false NOT NULL,
	`follow_optional` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`rev` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`) REFERENCES `vaccine_definition`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `child_vaccine_child_definition_unique` ON `child_vaccine` (`child_id`,`definition_id`);--> statement-breakpoint
CREATE INDEX `child_vaccine_child_due_idx` ON `child_vaccine` (`child_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `child_vaccine_family_rev_idx` ON `child_vaccine` (`family_id`,`rev`);--> statement-breakpoint
CREATE TABLE `child_vaccine_option` (
	`child_id` text NOT NULL,
	`option_group` text NOT NULL,
	`option_value` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `child_vaccine_option_child_group_unique` ON `child_vaccine_option` (`child_id`,`option_group`);--> statement-breakpoint
CREATE TABLE `growth_measurement` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`measured_at` text NOT NULL,
	`weight_g` integer,
	`length_mm` integer,
	`head_circ_mm` integer,
	`place` text,
	`note` text,
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
CREATE INDEX `growth_measurement_child_date_idx` ON `growth_measurement` (`child_id`,`measured_at`);--> statement-breakpoint
CREATE INDEX `growth_measurement_family_rev_idx` ON `growth_measurement` (`family_id`,`rev`);--> statement-breakpoint
CREATE TABLE `milestone_definition` (
	`id` text PRIMARY KEY NOT NULL,
	`age_months` integer NOT NULL,
	`domain` text NOT NULL,
	`text_id` text NOT NULL,
	`text_en` text NOT NULL,
	`sort_order` integer NOT NULL,
	`source` text NOT NULL,
	`source_url` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vaccine_definition` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_version` text NOT NULL,
	`vaccine_code` text NOT NULL,
	`dose_label_id` text NOT NULL,
	`dose_label_en` text NOT NULL,
	`due_offset` text NOT NULL,
	`window_end_offset` text NOT NULL,
	`category` text NOT NULL,
	`option_group` text,
	`option_value` text,
	`notes_id` text,
	`notes_en` text,
	`combo_hint_id` text,
	`combo_hint_en` text
);
