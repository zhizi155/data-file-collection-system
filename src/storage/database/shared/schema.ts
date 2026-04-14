import { pgTable, serial, timestamp, varchar, boolean, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 命名规则配置表
export const namingRules = pgTable(
	"naming_rules",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		name: varchar("name", { length: 100 }).notNull().unique(),
		pattern: varchar("pattern", { length: 500 }).notNull().default("{original}"),
		description: varchar("description", { length: 500 }),
		is_active: boolean("is_active").default(true).notNull(),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("naming_rules_name_idx").on(table.name),
		index("naming_rules_is_active_idx").on(table.is_active),
	]
);

// 上传文件记录表
export const uploadedFiles = pgTable(
	"uploaded_files",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		original_name: varchar("original_name", { length: 255 }).notNull(),
		stored_key: varchar("stored_key", { length: 500 }).notNull(),
		file_size: varchar("file_size", { length: 50 }).notNull(),
		mime_type: varchar("mime_type", { length: 100 }),
		rule_id: varchar("rule_id", { length: 36 }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("uploaded_files_stored_key_idx").on(table.stored_key),
		index("uploaded_files_rule_id_idx").on(table.rule_id),
		index("uploaded_files_created_at_idx").on(table.created_at),
	]
);
