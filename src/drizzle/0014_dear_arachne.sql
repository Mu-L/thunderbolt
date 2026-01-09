PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text,
	`role` text,
	`parts` text,
	`chat_thread_id` text,
	`model_id` text,
	`parent_id` text,
	`cache` text,
	`metadata` text
);
--> statement-breakpoint
INSERT INTO `__new_chat_messages`("id", "content", "role", "parts", "chat_thread_id", "model_id", "parent_id", "cache", "metadata") SELECT "id", "content", "role", "parts", "chat_thread_id", "model_id", "parent_id", "cache", "metadata" FROM `chat_messages`;--> statement-breakpoint
DROP TABLE `chat_messages`;--> statement-breakpoint
ALTER TABLE `__new_chat_messages` RENAME TO `chat_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`is_encrypted` integer DEFAULT 0,
	`triggered_by` text,
	`was_triggered_by_automation` integer DEFAULT 0,
	`context_size` integer
);
--> statement-breakpoint
INSERT INTO `__new_chat_threads`("id", "title", "is_encrypted", "triggered_by", "was_triggered_by_automation", "context_size") SELECT "id", "title", "is_encrypted", "triggered_by", "was_triggered_by_automation", "context_size" FROM `chat_threads`;--> statement-breakpoint
DROP TABLE `chat_threads`;--> statement-breakpoint
ALTER TABLE `__new_chat_threads` RENAME TO `chat_threads`;--> statement-breakpoint
CREATE TABLE `__new_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`prompt` text,
	`model_id` text,
	`deleted_at` integer,
	`default_hash` text
);
--> statement-breakpoint
INSERT INTO `__new_prompts`("id", "title", "prompt", "model_id", "deleted_at", "default_hash") SELECT "id", "title", "prompt", "model_id", "deleted_at", "default_hash" FROM `prompts`;--> statement-breakpoint
DROP TABLE `prompts`;--> statement-breakpoint
ALTER TABLE `__new_prompts` RENAME TO `prompts`;--> statement-breakpoint
CREATE TABLE `__new_triggers` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger_type` text,
	`trigger_time` text,
	`prompt_id` text,
	`is_enabled` integer DEFAULT 1
);
--> statement-breakpoint
INSERT INTO `__new_triggers`("id", "trigger_type", "trigger_time", "prompt_id", "is_enabled") SELECT "id", "trigger_type", "trigger_time", "prompt_id", "is_enabled" FROM `triggers`;--> statement-breakpoint
DROP TABLE `triggers`;--> statement-breakpoint
ALTER TABLE `__new_triggers` RENAME TO `triggers`;--> statement-breakpoint
CREATE TABLE `__new_mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`type` text DEFAULT 'http',
	`url` text,
	`command` text,
	`args` text,
	`enabled` integer DEFAULT 1,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
INSERT INTO `__new_mcp_servers`("id", "name", "type", "url", "command", "args", "enabled", "created_at", "updated_at") SELECT "id", "name", "type", "url", "command", "args", "enabled", "created_at", "updated_at" FROM `mcp_servers`;--> statement-breakpoint
DROP TABLE `mcp_servers`;--> statement-breakpoint
ALTER TABLE `__new_mcp_servers` RENAME TO `mcp_servers`;--> statement-breakpoint
CREATE TABLE `__new_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text,
	`name` text,
	`model` text,
	`url` text,
	`api_key` text,
	`is_system` integer DEFAULT 0,
	`enabled` integer DEFAULT 1,
	`tool_usage` integer DEFAULT 1,
	`is_confidential` integer DEFAULT 0,
	`start_with_reasoning` integer DEFAULT 0,
	`supports_parallel_tool_calls` integer DEFAULT 1,
	`context_window` integer,
	`deleted_at` integer,
	`default_hash` text,
	`vendor` text,
	`description` text
);
--> statement-breakpoint
INSERT INTO `__new_models`("id", "provider", "name", "model", "url", "api_key", "is_system", "enabled", "tool_usage", "is_confidential", "start_with_reasoning", "supports_parallel_tool_calls", "context_window", "deleted_at", "default_hash", "vendor", "description") SELECT "id", "provider", "name", "model", "url", "api_key", "is_system", "enabled", "tool_usage", "is_confidential", "start_with_reasoning", "supports_parallel_tool_calls", "context_window", "deleted_at", "default_hash", "vendor", "description" FROM `models`;--> statement-breakpoint
DROP TABLE `models`;--> statement-breakpoint
ALTER TABLE `__new_models` RENAME TO `models`;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`item` text,
	`order` integer DEFAULT 0,
	`is_complete` integer DEFAULT 0,
	`default_hash` text
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "item", "order", "is_complete", "default_hash") SELECT "id", "item", "order", "is_complete", "default_hash" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;