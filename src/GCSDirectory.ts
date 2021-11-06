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
        const name = file.name;
        if (name === prefix) {
          continue;
        }
        const joined = joinPaths(path, name);
        paths.push(joined);
      }
      return paths;
    } catch (e) {
      throw gfs._error(path, e, false);
    }
  }

  public async _mkcol(): Promise<void> {
    const gfs = this.gfs;
    const path = this.path;
    const dir = await gfs._getEntry(path, true);
    try {
      await dir.save("");
    } catch (e) {
      throw gfs._error(path, e, true);
    }
  }

  public async _rmdir(): Promise<void> {
    const gfs = this.gfs;
    const path = this.path;
    const dir = await gfs._getEntry(path, true);
    try {
      await dir.delete();
    } catch (e) {
      throw gfs._error(path, e, true);
    }
  }
}
