import { NotFoundError } from "univ-fs";
import { GCSFileSystem } from "../GCSFileSystem";

export const fs = new GCSFileSystem("nikochan2k-test", "univ-fs-test", {
  keyFilename: "secret.json",
});

export const setup = async () => {
  try {
    const root = await fs._getDirectory("/");
    await root.rm({ force: true, recursive: true, ignoreHook: true });
    await root.mkdir({ force: true, recursive: false, ignoreHook: true });
  } catch (e) {
    if (e.name !== NotFoundError.name) {
      throw e;
    }
  }
};
