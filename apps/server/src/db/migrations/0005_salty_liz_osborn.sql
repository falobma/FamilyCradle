CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`family_id`,`entity_type`,`entity_id`,`at`);--> statement-breakpoint
CREATE INDEX `log_entry_family_rev_idx` ON `log_entry` (`family_id`,`rev`);--> statement-breakpoint
CREATE INDEX `log_entry_child_type_started_idx` ON `log_entry` (`child_id`,`type`,`started_at`);--> statement-breakpoint
CREATE INDEX `log_entry_child_started_idx` ON `log_entry` (`child_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `log_entry_family_type_status_idx` ON `log_entry` (`family_id`,`type`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `log_entry_one_running_child_timer` ON `log_entry` (`child_id`,`type`) WHERE "log_entry"."status" IN ('running', 'paused') AND "log_entry"."type" IN ('sleep', 'breastfeed') AND "log_entry"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `log_entry_one_running_pump_per_user` ON `log_entry` (`family_id`,`created_by`) WHERE "log_entry"."status" IN ('running', 'paused') AND "log_entry"."type" = 'pumping' AND "log_entry"."deleted_at" IS NULL;