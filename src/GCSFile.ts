import { Data, hasReadable, readableConverter } from "univ-conv";
import { AbstractFile, ReadOptions, Stats, WriteOptions } from "univ-fs";
import { GCSFileSystem } from "./GCSFileSystem";

export class GCSFile extends AbstractFile {
  constructor(private gfs: GCSFileSystem, path: string) {
    super(gfs, path);
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async _load(_stats: Stats, _options: ReadOptions): Promise<Data> {
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

  protected async _rm(): Promise<void> {
    const gfs = this.gfs;
    const path = this.path;
    try {
      const file = this.gfs._getEntry(path, false);
      await file.delete();
    } catch (e) {
      throw gfs._error(path, e, true);
    }
  }

  protected async _save(
    data: Data,
    stats: Stats | undefined,
    options: WriteOptions
  ): Promise<void> {
    const gfs = this.gfs;
    const path = this.path;
    const converter = this._getConverter();

    const file = this.gfs._getEntry(path, false);
    if (stats) {
      const [obj] = await file.getMetadata(); // eslint-disable-line
      obj.metadata = gfs._createMetadata(stats); // eslint-disable-line
      await file.setMetadata(obj);
    }

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
}
