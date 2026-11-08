'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectExecutableFile } = require('../app/file-dialogs');

for (const platform of ['darwin', 'linux', 'win32']) {
  test(`executable picker uses platform-appropriate filters on ${platform}`, async () => {
    for (const tool of ['mkbrr', 'ffmpeg', 'BDInfoCLI', 'mkvpropedit']) {
      const filePath = platform === 'win32'
        ? `C:\\Program Files\\Tools\\${tool}.exe`
        : `/opt/tools/${tool}`;
      const dialog = {
        async showOpenDialog(options) {
          assert.deepEqual(options.properties, ['openFile']);
          assert.deepEqual(options.filters, platform === 'win32'
            ? [
              { name: 'Executable', extensions: ['exe'] },
              { name: 'All files', extensions: ['*'] }
            ]
            : [{ name: 'All files', extensions: ['*'] }]);
          return { canceled: false, filePaths: [filePath] };
        }
      };
      assert.equal(await selectExecutableFile(dialog, platform), filePath);
    }
  });
}

test('executable picker returns null when canceled or no file is selected', async () => {
  for (const result of [
    { canceled: true, filePaths: [] },
    { canceled: true, filePaths: ['/opt/tools/ffmpeg'] },
    { canceled: false, filePaths: [] }
  ]) {
    const dialog = { showOpenDialog: async () => result };
    assert.equal(await selectExecutableFile(dialog), null);
  }
});

test('executable picker propagates dialog errors', async () => {
  const error = new Error('Dialog unavailable');
  const dialog = { showOpenDialog: async () => { throw error; } };
  await assert.rejects(selectExecutableFile(dialog), error);
});
