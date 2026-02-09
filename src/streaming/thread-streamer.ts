import type { WebClient } from '@slack/web-api';
import { chunkText } from '../claude/parser.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'thread-streamer' });

export class ThreadStreamer {
  private buffer: string = '';
  private lastMessageTs: string | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isFinalized = false;
  private messageCount = 0;

  constructor(
    private client: WebClient,
    private channelId: string,
    private threadTs: string,
    private debounceMs = 300
  ) {}

  async append(text: string): Promise<void> {
    if (this.isFinalized) return;

    this.buffer += text;

    // Debounce to avoid rate limits
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush().catch(err => {
        log.error({ err }, 'Failed to flush buffer');
      });
    }, this.debounceMs);
  }

  private async flush(): Promise<void> {
    if (!this.buffer.trim()) return;

    const chunks = chunkText(this.buffer, 3900);
    const content = chunks[chunks.length - 1];

    try {
      // If we have a recent message and content fits, update it
      if (this.lastMessageTs && chunks.length === 1 && this.messageCount < 5) {
        await this.client.chat.update({
          channel: this.channelId,
          ts: this.lastMessageTs,
          text: content,
        });
      } else {
        // Send new message in thread
        const result = await this.client.chat.postMessage({
          channel: this.channelId,
          thread_ts: this.threadTs,
          text: content,
          unfurl_links: false,
          unfurl_media: false,
        });
        this.lastMessageTs = result.ts ?? null;
        this.messageCount++;

        // If there are multiple chunks, send them all
        if (chunks.length > 1) {
          for (let i = 0; i < chunks.length - 1; i++) {
            await this.client.chat.postMessage({
              channel: this.channelId,
              thread_ts: this.threadTs,
              text: chunks[i],
              unfurl_links: false,
              unfurl_media: false,
            });
            this.messageCount++;
          }
        }
      }
    } catch (err) {
      log.error({ err, channelId: this.channelId }, 'Failed to send to Slack');

      // If update failed (message too old), try posting new
      if ((err as { code?: string }).code === 'message_not_found' && this.lastMessageTs) {
        this.lastMessageTs = null;
        await this.flush();
      }
    }
  }

  async finalize(status?: string): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Final flush of any remaining content
    await this.flush();
    this.isFinalized = true;
    this.buffer = '';

    // Send status message if provided
    if (status) {
      try {
        await this.client.chat.postMessage({
          channel: this.channelId,
          thread_ts: this.threadTs,
          text: status,
        });
      } catch (err) {
        log.error({ err }, 'Failed to send status message');
      }
    }
  }

  async sendImmediate(text: string): Promise<void> {
    try {
      await this.client.chat.postMessage({
        channel: this.channelId,
        thread_ts: this.threadTs,
        text,
        unfurl_links: false,
        unfurl_media: false,
      });
      this.messageCount++;
    } catch (err) {
      log.error({ err }, 'Failed to send immediate message');
    }
  }

  reset(): void {
    this.buffer = '';
    this.lastMessageTs = null;
    this.isFinalized = false;
    this.messageCount = 0;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
