/**
 * ZSTD frame header parsing utilities.
 * 
 * @author 101arrowz
 * @see https://github.com/101arrowz/fzstd/blob/master/src/index.ts
 */

export const err = Error;
export interface DZS {
  d: number;  // dictionary ID
  u: number;  // uncompressed size
  e: number;  // window size
}

export const rb = /* @__PURE__ */ (d: Uint8Array, b: number, n: number) => {
  let i = 0, o = 0;
  for (; i < n; ++i) o |= d[b++] << (i << 3);
  return o;
};


export const _fss = (dat: Uint8Array): number => {
  const flg = dat[4];
  const ss = (flg >> 5) & 1, df = flg & 3, fcf = flg >> 6;
  // @ts-expect-error
  return rb(dat, (6 - ss) + df == 3 ? 4 : df, fcf ? (1 << fcf) : ss) + ((fcf == 1) && 256);
}

// Read Zstandard frame header
export const rzfh = /* @__PURE__ */ (dat: Uint8Array): number | DZS => {
  if ((dat[0] | (dat[1] << 8) | (dat[2] << 16)) == 0x2FB528 && dat[3] == 253) {
    // Zstandard frame
    const flg = dat[4];
    // single segment, checksum, dict flag, frame content flag
    const ss = (flg >> 5) & 1, df = flg & 3, fcf = flg >> 6;
    if (flg & 8) throw new err('bad zstd dat'); // Reserved bit check
    // byte
    let bt = 6 - ss;
    // dict bytes
    const db = df == 3 ? 4 : df;
    // dictionary id
    const di = rb(dat, bt, db);
    // @ts-expect-error
    const fss = rb(dat, bt + db, fcf ? (1 << fcf) : ss) + ((fcf == 1) && 256);
    // window size
    let ws = fss;
    if (!ss) {
      // window descriptor
      const wb = 1 << (10 + (dat[5] >> 3));
      ws = wb + (wb >> 3) * (dat[5] & 7);
    }
    if (ws > 2145386496) throw new err('win size 2 large');
    return {
      d: di,
      e: ws,
      u: fss
    };
  }
  throw new err('bad zstd dat');
};
