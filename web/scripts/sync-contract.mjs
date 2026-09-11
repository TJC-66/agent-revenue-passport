import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const source = resolve(scriptDirectory, '../../contracts/income_credibility_judge.py');
const destinationDirectory = resolve(scriptDirectory, '../public/contracts');
const destination = resolve(destinationDirectory, 'income_credibility_judge.py');

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);

console.log(`Synced ${source} -> ${destination}`);
