import { Bucket, Storage, StorageOptions } from "@google-cloud/storage";
import {
  AbstractDirectory,
  AbstractFile,
  AbstractFileSystem,
  createError,
  FileSystemOptions,
  joinPaths,
  NoModificationAllowedError,
  NotFoundError,
  NotReadableError,
  PatchOptions,
  Props,
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

  public _error(path: string, e: unknown, write: boolean) {
    let name: string;
    const code: number = (e as any).code; // eslint-disable-line
    if (code === 404) {
      name = NotFoundError.name;
    } else if (write) {
      name = NoModificationAllowedError.name;
    } else {
      name = NotReadableError.name;
    }
    return createError({
      name,
      repository: this.repository,
      path,
      e: e as any, // eslint-disable-line
    });
  }

  public async _getBucket() {
    if (this.bucket) {
      return this.bucket;
    }

    const storage = new Storage(this.storageOptions);
    this.bucket = storage.bucket(this.bucketName);
    const key = this._getKey("/", true);
    const root = this.bucket.file(key);
    try {
      await root.getMetadata();
      return this.bucket;
    } catch (e) {
      const err = this._error("/", e, false);
      if (err.name !== NotFoundError.name) {
        throw e;
      }
    }
    try {
      await root.create();
    } catch (e) {
      throw this._error("/", e, true);
    }

    return this.bucket;
  }

  public async _getEntry(path: string, isDirectory: boolean) {
    const bucket = await this._getBucket();
    const key = this._getKey(path, isDirectory);
    return bucket.file(key);
  }

  public _getKey(path: string, isDirectory: boolean) {
    let key: string;
    if (!path || path === "/") {
      key = this.repository;
    } else {
      key = joinPaths(this.repository, path);
    }
    if (isDirectory) {
      key += "/";
    }
    return key;
  }

  public async _getMetadata(path: string, isDirectory: boolean) {
    const entry = await this._getEntry(path, isDirectory);
    try {
      const res = await entry.getMetadata();
      return res[0] as { [key: string]: string };
    } catch (e) {
      throw this._error(path, e, false);
    }
  }

  public async _head(path: string): Promise<Stats> {
    const fileHead = this._getMetadata(path, true);
    const dirHead = this._getMetadata(path, false);
    const bucket = await this._getBucket();
    const dirList = bucket.getFiles({
      prefix: this._getKey(path, true),
      delimiter: "/",
      maxResults: 1,
    });
    const [fileHeadRes, dirHeadRes, dirListRes] = await Promise.allSettled([
      fileHead,
      dirHead,
      dirList,
    ]);
    if (fileHeadRes.status === "fulfilled") {
      return this._handleHead(fileHeadRes.value, false);
    } else if (dirHeadRes.status === "fulfilled") {
      const stats = this._handleHead(dirHeadRes.value, true);
      delete stats.size;
      return stats;
    }
    if (dirListRes.status === "fulfilled") {
      if (0 < dirListRes.value[0].length) {
        return {};
      }
    }
    throw this._error(path, fileHeadRes.reason, false);
  }

  public async _patch(
    path: string,
    props: Props,
    _options: PatchOptions // eslint-disable-line
  ): Promise<void> {
    const metadata = await this._getMetadata(path, true);
    for (const [key, value] of Object.entries(props)) {
      metadata[key] = "" + value; // eslint-disable-line
    }
    const entry = await this._getEntry(path, props["size"] === null);
    try {
      await entry.setMetadata(metadata);
    } catch (e) {
      throw this._error(path, e, true);
    }
  }

  public async _toURL(path: string, options?: URLOptions): Promise<string> {
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
          { message: `"${options.urlType}" is not supported` },
          false
        );
    }

    const file = await this._getEntry(path, true);
    try {
      const expires = new Date(Date.now() + (options.expires ?? 86400) * 1000);
      const res = await file.getSignedUrl({ action, expires });
      return res[0];
    } catch (e) {
      throw this._error(path, e, false);
    }
  }

  public async getDirectory(path: string): Promise<AbstractDirectory> {
    return Promise.resolve(new GCSDirectory(this, path));
  }

  public async getFile(path: string): Promise<AbstractFile> {
    return Promise.resolve(new GCSFile(this, path));
  }

  private _handleHead(
    metadata: { [key: string]: string },
    isDirectory: boolean
  ) {
    const stats: Stats = {};
    if (!isDirectory) {
      const size = parseInt(metadata["size"] as string);
      if (size) {
        stats.size = size;
      }
    }
    const created = new Date(metadata["timeCreated"] as string).getTime();
    if (created) {
      stats.created = created;
    }
    const modified = new Date(metadata["updated"] as string).getTime();
    if (modified) {
      stats.modified = modified;
    }
    const etag = metadata["etag"];
    if (etag) {
      stats.etag = etag;
    }
    for (const [key, value] of Object.entries(metadata ?? {})) {
      if (key === "size" || key === "etag") {
        continue;
      }
      stats[key] = value;
    }

    return stats;
  }
}
