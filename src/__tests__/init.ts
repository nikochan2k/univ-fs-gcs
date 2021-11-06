import { Storage } from "@google-cloud/storage";
import { NotFoundError } from "univ-fs";
import { GCSFileSystem } from "../GCSFileSystem";

export const fs = new GCSFileSystem("nikochan2k-test", "univ-fs-test", {
  keyFilename: "secret.json",
});
export const init = async () => {
  try {
    const storage = new Storage({ keyFilename: "secret.json" });
    const bucket = storage.bucket("nikochan2k-test");
    await bucket.deleteFiles();
  } catch (e) {
    if (e.name !== NotFoundError.name) {
      throw e;
    }
  }
};
