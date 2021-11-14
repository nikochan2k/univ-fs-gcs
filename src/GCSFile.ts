import { Readable } from "stream";
import { Converter, Data, isNode, isReadable } from "univ-conv";
import { AbstractFile, OpenOptions, Stats, WriteOptions } from "univ-fs";
import { GCSFileSystem } from "./GCSFileSystem";

export class GCSFile extends AbstractFile {
  constructor(private gfs: GCSFileSystem, path: string) {
    super(gfs, path);
  }

  // eslint-disable-next-line
  protected async _load(_stats: Stats, _options: OpenOptions): Promise<Data> {
    const file = await this.gfs._getEntry(this.path, false);
    if (isNode) {
      return file.createReadStream();
    } else {
      const res = await file.download();
      return res[0];
    }
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
      head = await this._load(stats, options);
    }

    const file = await this.gfs._getEntry(path, false);
    if (stats) {
      const [obj] = await file.getMetadata(); // eslint-disable-line
      obj.metadata = gfs._createMetadata(stats); // eslint-disable-line
      await file.setMetadata(obj);
    }

    try {
      if (isReadable(head) || isReadable(data)) {
        let readable: Readable;
        if (head) {
          readable = await converter.merge([head, data], "Readable");
        } else {
          readable = await converter.toReadable(data);
        }
        const writable = file.createWriteStream();
        await converter.pipe(readable, writable);
      } else {
        let buffer: Buffer;
        if (head) {
          buffer = await converter.merge([head, data], "Buffer");
        } else {
          buffer = await converter.toBuffer(data);
        }
        await file.save(buffer);
      }
    } catch (e) {
      throw gfs._error(path, e, true);
    }
  }
}
