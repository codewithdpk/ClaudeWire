import stripAnsi from 'strip-ansi';

/**
 * Strip ANSI escape codes from text
 */
export function cleanAnsi(text: string): string {
  return stripAnsi(text);
}

/**
 * Clean terminal control sequences that aren't standard ANSI
 */
export function cleanTerminalOutput(text: string): string {
  let cleaned = stripAnsi(text);

  // Remove carriage returns (but keep the text after them for progress updates)
  cleaned = cleaned.replace(/\r(?!\n)/g, '');

  // Remove null bytes
  cleaned = cleaned.replace(/\0/g, '');

  // Remove OSC sequences (Operating System Commands)
  cleaned = cleaned.replace(/\x1b\][^\x07]*\x07/g, '');

  // Remove DCS sequences (Device Control Strings)
  cleaned = cleaned.replace(/\x1bP[^\x1b]*\x1b\\/g, '');

  // Collapse multiple newlines into max 2
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Detect if output contains a tool use prompt (waiting for y/n)
 */
export function detectToolUsePrompt(text: string): boolean {
  const patterns = [
    /Allow\s+\w+\s+tool/i,
    /\[y\/n\]/i,
    /Press\s+y\s+to\s+allow/i,
    /Do you want to proceed/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

/**
 * Detect if Claude is still processing (spinner/progress indicators)
 */
export function detectProcessing(text: string): boolean {
  const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', '◐', '◓', '◑', '◒'];
  return spinnerChars.some(char => text.includes(char));
}

/**
 * Extract the tool name from a tool use prompt
 */
export function extractToolName(text: string): string | null {
  const match = text.match(/(?:Using|Allow)\s+(\w+)\s+tool/i);
  return match ? match[1] : null;
}

/**
 * Format output for Slack display
 */
export function formatForSlack(text: string): string {
  let formatted = cleanTerminalOutput(text);

  // Wrap code-like content in code blocks
  if (formatted.includes('```') || formatted.includes('function') || formatted.includes('const ')) {
    // Already has markdown or looks like code - leave as is
    return formatted;
  }

  // If output looks like file content or code, wrap in code block
  const codeIndicators = [
    /^import\s/m,
    /^export\s/m,
    /^class\s/m,
    /^def\s/m,
    /^function\s/m,
    /^\s*{/m,
    /^\s*\[/m,
  ];

  const looksLikeCode = codeIndicators.some(pattern => pattern.test(formatted));
  if (looksLikeCode && !formatted.startsWith('```')) {
    formatted = '```\n' + formatted + '\n```';
  }

  return formatted;
}

/**
 * Split text into chunks of maximum length, breaking at sensible points
 */
export function chunkText(text: string, maxLength: number = 3900): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good break point
    let breakPoint = -1;

    // Prefer breaking at paragraph boundaries
    const paragraphBreak = remaining.lastIndexOf('\n\n', maxLength);
    if (paragraphBreak > maxLength * 0.5) {
      breakPoint = paragraphBreak;
    }

    // Fall back to line breaks
    if (breakPoint === -1) {
      const lineBreak = remaining.lastIndexOf('\n', maxLength);
      if (lineBreak > maxLength * 0.3) {
        breakPoint = lineBreak;
      }
    }

    // Fall back to spaces
    if (breakPoint === -1) {
      const spaceBreak = remaining.lastIndexOf(' ', maxLength);
      if (spaceBreak > maxLength * 0.3) {
        breakPoint = spaceBreak;
      }
    }

    // Last resort: hard cut
    if (breakPoint === -1) {
      breakPoint = maxLength;
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return chunks;
}
