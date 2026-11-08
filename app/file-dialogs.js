async function selectExecutableFile(dialog, platform = process.platform) {
  const allFiles = { name: 'All files', extensions: ['*'] };
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: platform === 'win32'
      ? [{ name: 'Executable', extensions: ['exe'] }, allFiles]
      : [allFiles]
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
}

module.exports = { selectExecutableFile };
