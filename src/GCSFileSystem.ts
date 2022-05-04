import { Bucket, Storage, StorageOptions } from "@google-cloud/storage";
import {
  AbstractDirectory,
  AbstractFile,
  AbstractFileSystem,
  createError,
  FileSystemOptions,
  HeadOptions,
  joinPaths,
  NoModificationAllowedError,
  NotFoundError,
  NotReadableError,
  PatchOptions,
  Stats,
  URLOptions,
} from "univ-fs";
import { GCSDirectory } from "./GCSDirectory";
import { GCSFile } from "./GCSFile";

export interface Command {
  Bucket: string;
  Key: string;
}

export class GCSFileSystem extends AbstractFileSystem {
  private bucket?: Bucket;

  constructor(
    private bucketName: string,
    repository: string,
    private storageOptions: StorageOptions,
    options?: FileSystemOptions
  ) {
    super(repository, options);
  }

  public _createMetadata(props: Stats) {
    const metadata: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(props)) {
      if (0 <= ["size", "etag", "created", "modified"].indexOf(key)) {
        continue;
      }
      metadata[key] = "" + value; // eslint-disable-line
    }
    return metadata;
  }

  public _error(path: string, e: unknown, write: boolean) {
    let name: string;
    const code: number = (e as any).response?.statusCode; // eslint-disable-line
    if (code === 404) {
      name = NotFoundError.name as string;
    } else if (write) {
      name = NoModificationAllowedError.name as string;
    } else {
      name = NotReadableError.name as string;
    }
    return createError({
      name,
      repository: this.repository,
      path,
      e: e as any, // eslint-disable-line
    });
  }

  public _getBucket() {
    if (this.bucket) {
      return this.bucket;
    }

    const storage = new Storage(this.storageOptions);
    this.bucket = storage.bucket(this.bucketName);
    return this.bucket;
  }

  public _getDirectory(path: string): Promise<AbstractDirectory> {
    return Promise.resolve(new GCSDirectory(this, path));
  }

  public _getEntry(path: string, isDirectory: boolean) {
    const bucket = this._getBucket();
    const fullPath = this._getFullPath(path, isDirectory);
    return bucket.file(fullPath);
  }

  public _getFile(path: string): Promise<AbstractFile> {
    return Promise.resolve(new GCSFile(this, path));
  }

  public _getFullPath(path: string, isDirectory: boolean) {
    let fullPath: string;
    if (!path || path === "/") {
      fullPath = this.repository;
    } else {
      fullPath = joinPaths(this.repository, path, false);
    }
    if (isDirectory) {
      fullPath += "/";
    }
    return fullPath;
  }

  public async _getMetadata(path: string, isDirectory: boolean) {
    const entry = this._getEntry(path, isDirectory);
    try {
      const res = await entry.getMetadata();
      return res[0] as { [key: string]: string };
    } catch (e) {
      throw this._error(path, e, false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async _head(path: string, _?: HeadOptions): Promise<Stats> {
    try {
      const res = await this._getMetadata(path, false);
      return this._handleHead(res);
    } catch (e) {
      throw this._error(path, e, false);
    }
  }

  public async _patch(
    path: string,
    _stats: Stats,
    props: Stats,
    _options: PatchOptions // eslint-disable-line
  ): Promise<void> {
    const entry = this._getEntry(path, props["size"] === null);
    try {
      const [obj] = await entry.getMetadata(); // eslint-disable-line
      obj.metadata = this._createMetadata(props); // eslint-disable-line
      await entry.setMetadata(obj);
    } catch (e) {
      throw this._error(path, e, true);
    }
  }

  public async _toURL(
    path: string,
    _isDirectory: boolean,
    options?: URLOptions
  ): Promise<string> {
    options = { urlType: "GET", expires: 86400, ...options };
    let action: "read" | "write" | "delete";
    switch (options.urlType) {
      case "GET":
        action = "read";
        break;
      case "PUT":
      case "POST":
        action = "write";
        break;
      case "DELETE":
        action = "delete";
        break;
      default:
        throw this._error(
          path,
          { message: `"${options.urlType}" is not supported` }, // eslint-disable-line
          false
        );
    }

    const file = this._getEntry(path, false);
    try {
      const expires = new Date(Date.now() + (options.expires ?? 86400) * 1000);
      const res = await file.getSignedUrl({ action, expires });
      return res[0];
    } catch (e) {
      throw this._error(path, e, false);
    }
  }

  public canPatchAccessed(): boolean {
    return false;
  }

  public canPatchCreated(): boolean {
    return false;
  }

  public canPatchModified(): boolean {
    return false;
  }

  public supportDirectory(): boolean {
    return false;
  }

  /* eslint-disable */
  private _handleHead(obj: any) {
    const metadata = obj.metadata ?? {};
    const stats: Stats = {};
    for (const [key, value] of Object.entries(metadata)) {
      stats[key] = value as string;
    }
    stats.size = parseInt(obj["size"] as string);
    const created = new Date(obj["timeCreated"] as string).getTime();
    if (created) {
      stats.created = created;
    }
    const modified = new Date(obj["updated"] as string).getTime();
    if (modified) {
      stats.modified = modified;
    }
    const etag = obj["etag"];
    if (etag) {
      stats.etag = etag;
    }

    return stats;
  }

  /* eslint-enable */
}
