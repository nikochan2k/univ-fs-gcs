import { OnExists, OnNoParent, OnNotExist } from "univ-fs";
import { GCSFileSystem } from "../GCSFileSystem";

export const fs = new GCSFileSystem("nikochan2k-test", "univ-fs-test", {
  keyFilename: "secret.json",
});

export const setup = async () => {
  const root = await fs.getDirectory("/");
  await root.rm({
    onNotExist: OnNotExist.Ignore,
    recursive: true,
    ignoreHook: true,
  });
  await root.mkdir({
    onExists: OnExists.Ignore,
    onNoParent: OnNoParent.Error,
    ignoreHook: true,
  });
};
