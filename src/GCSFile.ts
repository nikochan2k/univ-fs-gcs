import { Data, hasReadable, readableConverter } from "univ-conv";
import { AbstractFile, ReadOptions, Stats, WriteOptions } from "univ-fs";
import { GCSFileSystem } from "./GCSFileSystem";

export class GCSFile extends AbstractFile {
  constructor(private gfs: GCSFileSystem, path: string) {
    super(gfs, path);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async _doRead(_stats: Stats, _options: ReadOptions): Promise<Data> {
    const gfs = this.gfs;
    const path = this.path;
    try {
      const file = gfs._getEntry(path, false);
      if (hasReadable) {
        return file.createReadStream();
      } else {
        const res = await file.download();
        return res[0];
      }
    } catch (e) {
      throw gfs._error(path, e, false);
    }
  }

  public async _doRm(): Promise<void> {
    const gfs = this.gfs;
    const path = this.path;
    try {
      const file = this.gfs._getEntry(path, false);
      await file.delete();
    } catch (e) {
      throw gfs._error(path, e, true);
    }
  }

  public async _doWrite(
    data: Data,
    _stats: Stats | undefined,
    options: WriteOptions
  ): Promise<void> {
    const gfs = this.gfs;
    const path = this.path;
    const converter = this._getConverter();
    const file = this.gfs._getEntry(path, false);

    try {
      if (readableConverter().typeEquals(data)) {
        const readable = await converter.toReadable(data, options);
        const writable = file.createWriteStream();
        await converter.pipe(readable, writable, options);
      } else {
        const buffer = await converter.toBuffer(data);
        await file.save(buffer);
      }
    } catch (e) {
      throw gfs._error(path, e, true);
    }
  }

  public supportAppend(): boolean {
    return false;
  }

  public supportRangeRead(): boolean {
    return false;
  }

  public supportRangeWrite(): boolean {
    return false;
  }
}
