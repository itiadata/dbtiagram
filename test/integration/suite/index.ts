/**
 * Mocha bootstrap that runs inside the VS Code test host.
 */
import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60_000 });

  const testsRoot = __dirname;
  const files = fs
    .readdirSync(testsRoot)
    .filter((file) => file.endsWith('.test.js') && !file.startsWith('index'));

  for (const file of files) {
    mocha.addFile(path.join(testsRoot, file));
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
