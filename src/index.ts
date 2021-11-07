if (!globalThis.Buffer) {
  globalThis.Buffer = require("buffer/").Buffer;
}

export * from "./GCSFileSystem";
export * from "./GCSDirectory";
export * from "./GCSFile";
