import { Readable } from "stream";
import { Converter, Data } from "univ-conv";
import { AbstractFile, OpenOptions, Stats, WriteOptions } from "univ-fs";
import { GCSFileSystem } from "./GCSFileSystem";

export class GCSFile extends AbstractFile {
  constructor(private gfs: GCSFileSystem, path: string) {
    super(gfs, path);
  }

  protected async _load(_options: OpenOptions): Promise<Data> {
    const file = await this.gfs._getEntry(this.path, false);
    return file.createReadStream();
  }

  protected async _rm(): Promise<void> {
    const gfs = this.gfs;
    const path = this.path;
    const file = await this.gfs._getEntry(path, false);
    try {
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
    const converter = new Converter(options);

    let head: Data | undefined;
    if (options.append && stats) {
      head = await this._load(options);
    }
    const file = await this.gfs._getEntry(path, false);
    try {
      let readable: Readable;
      if (head) {
        readable = await converter.merge([head, data], "Readable");
      } else {
        readable = await converter.toReadable(data);
      }
      const writable = file.createWriteStream();
      await converter.pipe(readable, writable);
    } catch (e) {
      throw gfs._error(path, e, true);
    }
  }
}
