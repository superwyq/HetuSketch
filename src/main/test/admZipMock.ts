export default class AdmZip {
  private _files: { entryName: string; data: Buffer }[] = [];

  addFile(entryName: string, data: Buffer): void {
    this._files.push({ entryName, data });
  }

  getEntries(): { entryName: string; getData: () => Buffer }[] {
    return this._files.map(f => ({
      entryName: f.entryName,
      getData: () => f.data
    }));
  }

  toBuffer(): Buffer {
    return Buffer.from(JSON.stringify(this._files));
  }

  writeZip(): void {
    // no-op for mock
  }
}
