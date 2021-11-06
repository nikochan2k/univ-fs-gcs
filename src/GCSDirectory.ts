import { AbstractDirectory, joinPaths } from "univ-fs";
import { GCSFileSystem } from "./GCSFileSystem";

export class GCSDirectory extends AbstractDirectory {
  constructor(private gfs: GCSFileSystem, path: string) {
    super(gfs, path);
  }

  public async _list(): Promise<string[]> {
    const gfs = this.gfs;
    const path = this.path;
    const paths: string[] = [];
    try {
      const prefix = gfs._getKey(path, true);
      const bucket = await gfs._getBucket();
      const res = await bucket.getFiles({ prefix, delimiter: "/" });
      for (const file of res[0]) {
        const joined = joinPaths(path, file.name);
        paths.push(joined);
      }
      return paths;
    } catch (e) {
      throw gfs._error(path, e, true);
    }
  }

  public async _mkcol(): Promise<void> {
    const gfs = this.gfs;
    const path = this.path;
    try {
      const dir = await gfs._getFile(path, false);
      await dir.create();
    } catch (e) {
      throw gfs._error(path, e, false);
    }
  }

  public async _rmdir(): Promise<void> {
    const gfs = this.gfs;
    const path = this.path;
    try {
      const dir = await gfs._getFile(path, false);
      await dir.delete();
    } catch (e) {
      throw gfs._error(path, e, false);
    }
  }
}
