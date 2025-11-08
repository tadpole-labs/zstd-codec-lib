export function hash(buffer: Buffer | Uint8Array): string {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return require('crypto').createHash('sha1').update(data).digest('hex');
}

export const slice = (buf: Buffer, start?: number, end?: number) => Buffer.from(buf.subarray(start, end));
