import { pgTable, text, timestamp, jsonb, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const libraryRegistryTable = pgTable("library_registry", {
  id: serial("id").primaryKey(),
  organization: text("organization").notNull().unique(),
  libraryName: text("library_name").notNull(),
  figmaFileId: text("figma_file_id").notNull(),
  manifest: jsonb("manifest").notNull(),
  enabledAxes: text("enabled_axes").array().notNull(), // ["a1", "a2", ...]
  customRules: jsonb("custom_rules"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const componentMappingTable = pgTable("component_mapping", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  figmaComponentId: text("figma_component_id").notNull(),
  figmaComponentName: text("figma_component_name").notNull(),
  manifestComponentId: text("manifest_component_id").notNull(),
  family: text("family").notNull(),
  tier: integer("tier").notNull(),
  shape: text("shape").notNull(),
  axes: jsonb("axes"), // { a1: 0, a2: 1, ... }
  maxAxes: jsonb("max_axes"),
  variants: jsonb("variants").array().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const extractedTokensTable = pgTable("extracted_tokens", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name: text("name").notNull(), // "colors", "sizes", "strokes"
  tokens: jsonb("tokens").notNull(), // { "token-name": value, ... }
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const importHistoryTable = pgTable("import_history", {
  id: serial("id").primaryKey(),
  organization: text("organization").notNull(),
  figmaFileId: text("figma_file_id").notNull(),
  totalComponents: integer("total_components").notNull(),
  totalVariants: integer("total_variants").notNull(),
  unmappedComponents: text("unmapped_components").array().default([]),
  errors: text("errors").array().default([]),
  status: text("status", {
    enum: ["success", "partial", "failed"],
  }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Zod schemas
export const insertLibraryRegistrySchema = createInsertSchema(libraryRegistryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLibraryRegistry = z.infer<typeof insertLibraryRegistrySchema>;
export type LibraryRegistry = typeof libraryRegistryTable.$inferSelect;

export const insertComponentMappingSchema = createInsertSchema(componentMappingTable).omit({ id: true, createdAt: true });
export type InsertComponentMapping = z.infer<typeof insertComponentMappingSchema>;
export type ComponentMapping = typeof componentMappingTable.$inferSelect;

export const insertExtractedTokensSchema = createInsertSchema(extractedTokensTable).omit({ id: true, createdAt: true });
export type InsertExtractedTokens = z.infer<typeof insertExtractedTokensSchema>;
export type ExtractedTokensRecord = typeof extractedTokensTable.$inferSelect;

export const insertImportHistorySchema = createInsertSchema(importHistoryTable).omit({ id: true, createdAt: true });
export type InsertImportHistory = z.infer<typeof insertImportHistorySchema>;
export type ImportHistory = typeof importHistoryTable.$inferSelect;
