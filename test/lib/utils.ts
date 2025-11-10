import { createHash } from 'node:crypto';

export function hash(buffer: Buffer | Uint8Array): string {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return createHash('sha1').update(data).digest('hex');
}

export const slice = (buf: Buffer, start?: number, end?: number) =>
  Buffer.from(buf.subarray(start, end));
