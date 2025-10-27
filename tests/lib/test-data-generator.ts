import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_DIR = join(__dirname, '../data');
const DICT_DIR = join(__dirname, '../dictionaries');
const ZSTD_DIR = join(__dirname, '../../vendor/zstd');

const TEST_FILES: Array<[string, string]> = [
  ['tiny-256b.bin', '-g256 -P80 -s8'],
  ['small-highly-compressible.bin', '-g1024 -P90 -s1'],
  ['medium-10k.bin', '-g10240 -P50 -s2'],
  ['random-10k.bin', '-g10240 -P0 -s6'],
  ['repetitive-50k.bin', '-g51200 -P95 -s7'],
  ['medium-100k.bin', '-g102400 -P70 -s3'],
  ['large-512k.bin', '-g524288 -P65 -s4'],
  ['large-1m.bin', '-g1048576 -P60 -s5'],
];

export function ensureTestData(): void {
  if (existsSync(join(DATA_DIR, 'large-1m.bin'))) return;
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(DICT_DIR, { recursive: true });
  
  const datagen = `${ZSTD_DIR}/tests/datagen`;
  const zstd = `${ZSTD_DIR}/zstd`;
  
  if (!existsSync(datagen)) {
    execSync('make datagen', { cwd: `${ZSTD_DIR}/tests`, stdio: 'pipe' });
  }
  if (!existsSync(zstd)) {
    execSync('make zstd', { cwd: ZSTD_DIR, stdio: 'pipe' });
  }
  
  TEST_FILES.forEach(([name, args]) => {
    execSync(`${datagen} ${args} > ${DATA_DIR}/${name}`, { shell: '/bin/sh', encoding: 'buffer' });
  });
  
  const dictFile = `${DICT_DIR}/test.dict`;
  if (!existsSync(dictFile)) {
    execSync(`${zstd} --train ${DATA_DIR}/*.bin -o ${dictFile} --maxdict=16384`, { stdio: 'pipe' });
  }
  
  const testJsonPath = join(DATA_DIR, 'test.json');
  if (!existsSync(testJsonPath)) {
    const testData = {
      name: "test",
      data: Array(100).fill(0).map((_, i) => ({
        id: i,
        value: `value_${i}`,
        nested: { field: `field_${i}` }
      }))
    };
    writeFileSync(testJsonPath, JSON.stringify(testData, null, 2));

    const jsonDictFile = `${DICT_DIR}/test.json.dict`;
    if (!existsSync(jsonDictFile)) {
      execSync(`${zstd} --train ${DATA_DIR}/test.json -o ${jsonDictFile} --maxdict=8192`, { stdio: 'pipe' });
    }
  }
}
