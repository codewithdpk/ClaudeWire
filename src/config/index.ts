import { z } from 'zod';

const configSchema = z.object({
  slack: z.object({
    botToken: z.string().startsWith('xoxb-', { message: 'Bot token must start with xoxb-' }),
    signingSecret: z.string().min(1, 'Signing secret is required'),
    appToken: z.string().startsWith('xapp-', { message: 'App token must start with xapp-' }),
  }),

  claude: z.object({
    projectsDir: z.string().default('./projects'),
    maxSessionsPerUser: z.number().int().positive().default(1),
    sessionTimeoutMinutes: z.number().int().positive().default(60),
  }),

  redis: z.object({
    url: z.string().url().default('redis://localhost:6379'),
  }),

  sqlite: z.object({
    path: z.string().default('./data/claudewire.db'),
  }),

  auth: z.object({
    allowedUserIds: z.array(z.string()).default([]),
    adminUserIds: z.array(z.string()).default([]),
    allowAll: z.boolean().default(false),
  }),

  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    pretty: z.boolean().default(process.env.NODE_ENV !== 'production'),
  }),
});

export type Config = z.infer<typeof configSchema>;

function parseEnvArray(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function loadConfig(): Config {
  const rawConfig = {
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN ?? '',
      signingSecret: process.env.SLACK_SIGNING_SECRET ?? '',
      appToken: process.env.SLACK_APP_TOKEN ?? '',
    },
    claude: {
      projectsDir: process.env.PROJECTS_DIR,
      maxSessionsPerUser: process.env.MAX_SESSIONS_PER_USER
        ? parseInt(process.env.MAX_SESSIONS_PER_USER, 10)
        : undefined,
      sessionTimeoutMinutes: process.env.SESSION_TIMEOUT_MINUTES
        ? parseInt(process.env.SESSION_TIMEOUT_MINUTES, 10)
        : undefined,
    },
    redis: {
      url: process.env.REDIS_URL,
    },
    sqlite: {
      path: process.env.SQLITE_PATH,
    },
    auth: {
      allowedUserIds: parseEnvArray(process.env.ALLOWED_USER_IDS),
      adminUserIds: parseEnvArray(process.env.ADMIN_USER_IDS),
      allowAll: process.env.ALLOW_ALL_USERS === 'true',
    },
    logging: {
      level: process.env.LOG_LEVEL as Config['logging']['level'] | undefined,
      pretty: process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV !== 'production',
    },
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error('Configuration validation failed:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
