import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'auth' });

export class AuthService {
  private allowedUsers: Set<string>;
  private adminUsers: Set<string>;
  private allowAll: boolean;

  constructor() {
    this.allowedUsers = new Set(config.auth.allowedUserIds);
    this.adminUsers = new Set(config.auth.adminUserIds);
    this.allowAll = config.auth.allowAll;

    log.info({
      allowedCount: this.allowedUsers.size,
      adminCount: this.adminUsers.size,
      allowAll: this.allowAll,
    }, 'Auth service initialized');
  }

  isAllowed(userId: string): boolean {
    if (this.allowAll) {
      return true;
    }

    const allowed = this.allowedUsers.has(userId) || this.adminUsers.has(userId);

    if (!allowed) {
      log.debug({ userId }, 'User not authorized');
    }

    return allowed;
  }

  isAdmin(userId: string): boolean {
    return this.adminUsers.has(userId);
  }

  addAllowedUser(userId: string): void {
    this.allowedUsers.add(userId);
    log.info({ userId }, 'Added user to allowlist');
  }

  removeAllowedUser(userId: string): void {
    this.allowedUsers.delete(userId);
    log.info({ userId }, 'Removed user from allowlist');
  }

  getAllowedUsers(): string[] {
    return Array.from(this.allowedUsers);
  }
}
