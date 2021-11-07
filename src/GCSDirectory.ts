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
      // eslint-disable-next-line
      const [files, , apiResponse] = await bucket.getFiles({
        autoPaginate: false,
        prefix,
        delimiter: "/",
      });
      const prefixes = (apiResponse?.prefixes ?? []) as string[]; // eslint-disable-line
      for (const dir of prefixes) {
        if (prefix === dir) {
          continue;
        }
        const parts = dir.split("/");
        const name = parts[parts.length - 2] as string;
        const joined = joinPaths(path, name);
        paths.push(joined);
      }
      for (const file of files ?? []) {
        if (prefix === file.name) {
          continue;
        }
        const parts = file.name.split("/");
        const name = parts[parts.length - 1] as string;
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
