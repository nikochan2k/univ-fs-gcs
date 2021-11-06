import { Readable } from "stream";
import { Converter, Data } from "univ-conv";
import {
  AbstractFile,
  createError,
  ErrorLike,
  NotFoundError,
  OpenOptions,
  Stats,
  WriteOptions,
} from "univ-fs";
import { GCSFileSystem } from "./GCSFileSystem";

export class GCSFile extends AbstractFile {
  constructor(private gfs: GCSFileSystem, path: string) {
    super(gfs, path);
  }

  protected async _load(_options: OpenOptions): Promise<Data> {
    const gfs = this.gfs;
    const path = this.path;

    try {
      const file = await gfs._getFile(path, true);
      return file.createReadStream();
    } catch (e) {
      throw createError({ repository: gfs.repository, path, e });
    }
  }

  protected async _rm(): Promise<void> {
    const gfs = this.gfs;
    const path = this.path;
    try {
      const file = await this.gfs._getFile(path, true);
      await file.delete();
    } catch (e) {
      throw gfs._error(path, e, false);
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

    try {
      const file = await this.gfs._getFile(path, true);

      let head: Data | undefined;
      if (options.append && stats) {
        try {
          head = await this._load(options);
        } catch (e: unknown) {
          if ((e as ErrorLike).name !== NotFoundError.name) {
            throw e;
          }
        }
      }
      let readable: Readable;
      if (head) {
        readable = await converter.merge([head, data], "Readable");
      } else {
        readable = await converter.toReadable(data);
      }
      const writable = file.createWriteStream();
      await converter.pipe(readable, writable);
    } catch (e) {
      throw gfs._error(path, e, false);
    }
  }
}
