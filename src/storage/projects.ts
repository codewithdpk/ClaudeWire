import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'projects' });

export class ProjectManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? config.claude.projectsDir;
    this.ensureBaseDir();
  }

  private ensureBaseDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      log.info({ baseDir: this.baseDir }, 'Created projects base directory');
    }
  }

  getUserProjectDir(userId: string): string {
    // Sanitize userId to prevent path traversal
    const sanitized = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userDir = path.join(this.baseDir, sanitized);

    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
      log.info({ userId, userDir }, 'Created user project directory');
    }

    return userDir;
  }

  validateProjectPath(requestedPath: string, userId: string): string | null {
    const userDir = this.getUserProjectDir(userId);
    const resolved = path.resolve(requestedPath);

    // If path is under user's directory, allow it
    if (resolved.startsWith(userDir)) {
      // Ensure the directory exists
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }
      return resolved;
    }

    // For admin users, we might allow other paths in the future
    // For now, only allow paths under the user's directory
    log.warn({ userId, requestedPath, userDir }, 'Attempted to access path outside user directory');
    return null;
  }

  listUserProjects(userId: string): string[] {
    const userDir = this.getUserProjectDir(userId);

    try {
      const entries = fs.readdirSync(userDir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => path.join(userDir, e.name));
    } catch {
      return [];
    }
  }

  getProjectInfo(projectPath: string): { exists: boolean; hasGit: boolean; fileCount: number } {
    const exists = fs.existsSync(projectPath);
    if (!exists) {
      return { exists: false, hasGit: false, fileCount: 0 };
    }

    const hasGit = fs.existsSync(path.join(projectPath, '.git'));

    let fileCount = 0;
    try {
      const entries = fs.readdirSync(projectPath);
      fileCount = entries.length;
    } catch {
      // Ignore errors
    }

    return { exists, hasGit, fileCount };
  }
}
