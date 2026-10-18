import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  username: text('username').unique(),
  displayUsername: text('displayUsername'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const dragonTelemetryRecords = pgTable('dragon_telemetry_records', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  dragonId: text('dragon_id').notNull(),
  nodeId: text('node_id').notNull(),
  eventType: text('event_type').notNull(),
  healthPercent: real('health_percent').notNull(),
  hitsTaken: integer('hits_taken').notNull(),
  hitCapacity: integer('hit_capacity').notNull(),
  skills: jsonb('skills').$type<string[]>().notNull().default([]),
  payload: jsonb('payload').$type<Record<string, string>>().notNull().default({}),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})

export const dragonControlState = pgTable('dragon_control_state', {
  fighterId: text('fighter_id').primaryKey(),
  nodeId: text('node_id').notNull(),
  individualMode: text('individual_mode').notNull().default('guard'),
  sharedCommand: text('shared_command').notNull().default('independent'),
  invisible: boolean('invisible').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
})

export const dragonMasterAuthority = pgTable('dragon_master_authority', {
  singleton: boolean('singleton').primaryKey().notNull().default(true),
  mmUserId: text('mm_user_id').references(() => user.id, { onDelete: 'restrict' }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
})

export const dragonCommandQueue = pgTable('dragon_command_queue', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  fighterId: text('fighter_id').notNull(),
  strategy: text('strategy').notNull(),
  formation: text('formation').notNull(),
  issuedBy: text('issued_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  status: text('status').notNull().default('queued'),
  threatType: text('threat_type').notNull().default('unclassified'),
})

export const dragonEmergencyStop = pgTable('dragon_emergency_stop', {
  singleton: boolean('singleton').primaryKey().notNull().default(true),
  stopRuach: boolean('stop_ruach').notNull().default(false),
  stopXena: boolean('stop_xena').notNull().default(false),
  stopSuperbot: boolean('stop_superbot').notNull().default(false),
  stopAll: boolean('stop_all').notNull().default(false),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'restrict' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const magicDragonInsights = pgTable('magic_dragon_insights', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  insightDate: date('insight_date', { mode: 'string' }).notNull(),
  countryCode: text('country_code').notNull(),
  countryName: text('country_name').notNull(),
  visitorCount: integer('visitor_count').notNull(),
  source: text('source').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
})

export const securityAlertIncidents = pgTable('security_alert_incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteScope: text('site_scope').notNull(),
  status: text('status').notNull(),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  blockedCount: integer('blocked_count').notNull().default(0),
  smsStatus: text('sms_status').notNull().default('pending'),
  smsSentAt: timestamp('sms_sent_at', { withTimezone: true }),
  smsProviderId: text('sms_provider_id'),
  smsError: text('sms_error'),
})

export const userSecretVaults = pgTable('user_secret_vaults', {
  userId: text('user_id').primaryKey().notNull().references(() => user.id, { onDelete: 'cascade' }),
  salt: text('salt').notNull(),
  iv: text('iv').notNull(),
  ciphertext: text('ciphertext').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
