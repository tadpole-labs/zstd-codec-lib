
export async function hashBuffer(buffer: Buffer | Uint8Array): Promise<string> {
  const data = new Uint8Array(buffer);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer).toString('hex');
}
