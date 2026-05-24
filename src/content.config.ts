import { defineCollection, z } from "astro:content";

const baseSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).optional().default([]),
  summary: z.string(),
  canon_status: z.enum(["canon", "provisional", "rumor", "contradicted", "retconned"]),
  confidence: z.enum(["high", "medium", "low"]),
  source_type: z.enum(["rp_log", "novel", "mixed"]),
  sources: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  first_seen: z.string().optional(),
  last_updated: z.string()
});

const characters = defineCollection({
  type: "content",
  schema: baseSchema.extend({
    species: z.string().optional().default(""),
    gender: z.string().optional().default(""),
    age: z.string().optional().default(""),
    occupation: z.string().optional().default(""),
    role: z.string().optional().default(""),
    story_project: z.string().optional().default(""),
    affiliations: z.array(z.string()).optional().default([]),
    related_locations: z.array(z.string()).optional().default([]),
    related_characters: z.array(z.string()).optional().default([]),
    status: z.string().optional().default("unknown")
  })
});

const locations = defineCollection({
  type: "content",
  schema: baseSchema.extend({
    region: z.string().optional().default(""),
    parent_location: z.string().optional().default(""),
    related_factions: z.array(z.string()).optional().default([]),
    related_characters: z.array(z.string()).optional().default([]),
    related_events: z.array(z.string()).optional().default([]),
    status: z.string().optional().default("unknown")
  })
});

const factions = defineCollection({
  type: "content",
  schema: baseSchema.extend({
    leader: z.string().optional().default(""),
    base_location: z.string().optional().default(""),
    related_characters: z.array(z.string()).optional().default([]),
    related_locations: z.array(z.string()).optional().default([]),
    related_events: z.array(z.string()).optional().default([]),
    status: z.string().optional().default("unknown")
  })
});

const events = defineCollection({
  type: "content",
  schema: baseSchema.extend({
    date_label: z.string().optional().default(""),
    order: z.number().optional().default(0),
    related_characters: z.array(z.string()).optional().default([]),
    related_locations: z.array(z.string()).optional().default([]),
    related_factions: z.array(z.string()).optional().default([]),
    causes: z.array(z.string()).optional().default([]),
    consequences: z.array(z.string()).optional().default([])
  })
});

const concepts = defineCollection({
  type: "content",
  schema: baseSchema.extend({
    related_characters: z.array(z.string()).optional().default([]),
    related_locations: z.array(z.string()).optional().default([]),
    related_factions: z.array(z.string()).optional().default([])
  })
});

const items = defineCollection({
  type: "content",
  schema: baseSchema.extend({
    owner: z.string().optional().default(""),
    related_characters: z.array(z.string()).optional().default([]),
    related_locations: z.array(z.string()).optional().default([]),
    related_events: z.array(z.string()).optional().default([]),
    status: z.string().optional().default("unknown")
  })
});

const sessions = defineCollection({
  type: "content",
  schema: baseSchema.extend({
    date_played: z.string().optional().default(""),
    related_characters: z.array(z.string()).optional().default([]),
    related_locations: z.array(z.string()).optional().default([]),
    related_factions: z.array(z.string()).optional().default([]),
    related_events: z.array(z.string()).optional().default([])
  })
});

export const collections = {
  characters,
  locations,
  factions,
  events,
  concepts,
  items,
  sessions
};
