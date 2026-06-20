export default class AdmZip {
  private _files: { entryName: string; data: Buffer }[] = [];

  constructor(zipPath?: string) {
    void zipPath;
  }

  addFile(entryName: string, data: Buffer): void {
    this._files.push({ entryName, data });
  }

  addLocalFolder(_localPath: string, zipPath = ''): void {
    this._files.push({ entryName: zipPath || 'folder', data: Buffer.from('mock-folder') });
  }

  getEntries(): { entryName: string; getData: () => Buffer }[] {
    return this._files.map((file) => ({
      entryName: file.entryName,
      getData: () => file.data
    }));
  }

  extractAllTo(): void {
    // no-op for mock
  }

  toBuffer(): Buffer {
    return Buffer.from(JSON.stringify(this._files));
  }

  writeZip(): void {
    // no-op for mock
  }
}
