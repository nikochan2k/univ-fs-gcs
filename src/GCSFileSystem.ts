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

  public _createMetadata(props: Props) {
    const metadata: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(props)) {
      metadata[key] = "" + value; // eslint-disable-line
    }
    return metadata;
  }

  public _error(path: string, e: unknown, write: boolean) {
    let name: string;
    const code: number = (e as any).response?.statusCode; // eslint-disable-line
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
    let root = this.bucket.file(key);
    try {
      await root.getMetadata();
      return this.bucket;
    } catch (e) {
      const err = this._error("/", e, false);
      if (err.name !== NotFoundError.name) {
        throw e;
      }
    }
    root = this.bucket.file(key);
    try {
      await root.save("");
    } catch (e) {
      throw this._error("/", e, true);
    }

    return this.bucket;
  }

  public async _getDirectory(path: string): Promise<AbstractDirectory> {
    return Promise.resolve(new GCSDirectory(this, path));
  }

  public async _getEntry(path: string, isDirectory: boolean) {
    const bucket = await this._getBucket();
    const key = this._getKey(path, isDirectory);
    return bucket.file(key);
  }

  public async _getFile(path: string): Promise<AbstractFile> {
    return Promise.resolve(new GCSFile(this, path));
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

  public async _head(path: string, options?: HeadOptions): Promise<Stats> {
    options = { ...options };
    const isFile = !options.type || options.type === "file";
    const isDirectory = !options.type || options.type === "directory";
    const bucket = await this._getBucket();
    const fileHead = isFile ? this._getMetadata(path, false) : Promise.reject();
    const dirHead = isDirectory
      ? this._getMetadata(path, true)
      : Promise.reject();
    const dirList = isDirectory
      ? bucket.getFiles({
          prefix: this._getKey(path, true),
          delimiter: "/",
          maxResults: 1,
        })
      : Promise.reject();
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
    } else if (dirListRes.status === "fulfilled") {
      if (0 < dirListRes.value[0].length) {
        return {};
      }
    }
    let dirListReason: unknown | undefined;
    if (dirListRes.status === "rejected") {
      dirListReason = dirListRes.reason;
    }
    if (isFile) {
      throw this._error(path, fileHeadRes.reason, false);
    }
    if (isDirectory) {
      if (dirHeadRes.reason) {
        throw this._error(path, dirHeadRes.reason, false);
      }
    }
    throw this._error(path, dirListReason, false);
  }

  public async _patch(
    path: string,
    props: Props,
    _options: PatchOptions // eslint-disable-line
  ): Promise<void> {
    const entry = await this._getEntry(path, props["size"] === null);
    try {
      await entry.setMetadata(this._createMetadata(props));
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

  private _handleHead(
    metadata: { [key: string]: string },
    isDirectory: boolean
  ) {
    const stats: Stats = {};
    if (!isDirectory) {
      const size = parseInt(metadata["size"] as string);
      if (size != null) {
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
