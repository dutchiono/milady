import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCodesignArgs,
  classifyMachOKind,
  isRetryableCodesignFailure,
  materializeLinuxBundleSymlinks,
  resolvePostBuildBundlePath,
  resolveRuntimeNodeModulesPath,
  shouldConsiderForCodesign,
} from "../../scripts/postwrap-sign-runtime-macos";

describe("classifyMachOKind", () => {
  it("classifies Mach-O executables and libraries", () => {
    expect(classifyMachOKind("Mach-O 64-bit executable arm64")).toBe(
      "executable",
    );
    expect(classifyMachOKind("Mach-O 64-bit bundle arm64")).toBe("library");
    expect(
      classifyMachOKind(
        "Mach-O 64-bit dynamically linked shared library arm64",
      ),
    ).toBe("library");
  });

  it("ignores non-Mach-O files", () => {
    expect(classifyMachOKind("ELF 64-bit LSB shared object")).toBeNull();
    expect(classifyMachOKind("ASCII text")).toBeNull();
  });
});

describe("buildCodesignArgs", () => {
  it("adds hardened runtime only for executables", () => {
    expect(
      buildCodesignArgs(
        "executable",
        "Developer ID Application: Test",
        "/tmp/helper",
      ),
    ).toEqual([
      "--force",
      "--timestamp",
      "--sign",
      "Developer ID Application: Test",
      "--options",
      "runtime",
      "/tmp/helper",
    ]);

    expect(
      buildCodesignArgs(
        "library",
        "Developer ID Application: Test",
        "/tmp/addon.node",
      ),
    ).toEqual([
      "--force",
      "--timestamp",
      "--sign",
      "Developer ID Application: Test",
      "/tmp/addon.node",
    ]);
  });
});

describe("isRetryableCodesignFailure", () => {
  it("retries timestamp service outages", () => {
    expect(
      isRetryableCodesignFailure("The timestamp service is not available."),
    ).toBe(true);
    expect(
      isRetryableCodesignFailure("codesign: resource envelope is obsolete"),
    ).toBe(false);
  });
});

describe("resolveRuntimeNodeModulesPath", () => {
  it("derives the Linux postBuild bundle path from ELECTROBUN_BUILD_DIR", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const stableBundle = path.join(tempDir, "Milady");
    const canaryBundle = path.join(tempDir, "Milady canary");
    fs.mkdirSync(path.join(stableBundle, "bin"), { recursive: true });
    fs.mkdirSync(path.join(stableBundle, "resources"), { recursive: true });
    fs.mkdirSync(path.join(canaryBundle, "bin"), { recursive: true });
    fs.mkdirSync(path.join(canaryBundle, "resources"), { recursive: true });

    expect(
      resolvePostBuildBundlePath([], {
        ELECTROBUN_BUILD_DIR: tempDir,
        ELECTROBUN_OS: "linux",
        ELECTROBUN_APP_NAME: "Milady-canary",
      }),
    ).toBe(canaryBundle);
  });

  it("accepts an explicit runtime node_modules path", () => {
    expect(
      resolveRuntimeNodeModulesPath(
        ["/tmp/Milady.app/Contents/Resources/app/milady-dist/node_modules"],
        {},
      ),
    ).toBe("/tmp/Milady.app/Contents/Resources/app/milady-dist/node_modules");
  });

  it("derives the runtime node_modules path from the wrapped app bundle", () => {
    expect(
      resolveRuntimeNodeModulesPath([], {
        ELECTROBUN_WRAPPER_BUNDLE_PATH: "/tmp/Milady.app",
      }),
    ).toBe("/tmp/Milady.app/Contents/Resources/app/milady-dist/node_modules");
  });

  it("derives the runtime node_modules path from the postBuild bundle in ELECTROBUN_BUILD_DIR", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const appBundle = path.join(tempDir, "Milady canary.app");
    fs.mkdirSync(
      path.join(
        appBundle,
        "Contents",
        "Resources",
        "app",
        "milady-dist",
        "node_modules",
      ),
      { recursive: true },
    );

    expect(
      resolveRuntimeNodeModulesPath([], {
        ELECTROBUN_BUILD_DIR: tempDir,
        ELECTROBUN_OS: "macos",
      }),
    ).toBe(
      path.join(
        appBundle,
        "Contents",
        "Resources",
        "app",
        "milady-dist",
        "node_modules",
      ),
    );
  });

  it("matches the correct app bundle in ELECTROBUN_BUILD_DIR using ELECTROBUN_APP_NAME", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const stableBundle = path.join(tempDir, "Milady.app");
    const canaryBundle = path.join(tempDir, "Milady canary.app");
    fs.mkdirSync(
      path.join(
        stableBundle,
        "Contents",
        "Resources",
        "app",
        "milady-dist",
        "node_modules",
      ),
      { recursive: true },
    );
    fs.mkdirSync(
      path.join(
        canaryBundle,
        "Contents",
        "Resources",
        "app",
        "milady-dist",
        "node_modules",
      ),
      { recursive: true },
    );

    expect(
      resolveRuntimeNodeModulesPath([], {
        ELECTROBUN_BUILD_DIR: tempDir,
        ELECTROBUN_OS: "macos",
        ELECTROBUN_APP_NAME: "Milady-canary",
      }),
    ).toBe(
      path.join(
        canaryBundle,
        "Contents",
        "Resources",
        "app",
        "milady-dist",
        "node_modules",
      ),
    );
  });

  it("accepts a milady-dist directory and appends node_modules", () => {
    expect(resolveRuntimeNodeModulesPath(["/tmp/milady-dist"], {})).toBe(
      "/tmp/milady-dist/node_modules",
    );
  });

  it("accepts an explicit dist/node_modules path for pre-wrap signing", () => {
    expect(resolveRuntimeNodeModulesPath(["/tmp/dist/node_modules"], {})).toBe(
      "/tmp/dist/node_modules",
    );
  });
});

describe("materializeLinuxBundleSymlinks", () => {
  it("replaces Linux file symlinks with copied payloads inside the bundle", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-linux-"));
    const bundlePath = path.join(tempDir, "Milady");
    const targetDir = path.join(bundlePath, "bin", "cef");
    const targetPath = path.join(targetDir, "libEGL.so");
    const symlinkPath = path.join(bundlePath, "bin", "libEGL.so");

    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(path.join(bundlePath, "resources"), { recursive: true });
    fs.writeFileSync(targetPath, "cef-egl");
    fs.chmodSync(targetPath, 0o755);
    fs.symlinkSync(path.join("cef", "libEGL.so"), symlinkPath);

    expect(materializeLinuxBundleSymlinks(bundlePath)).toEqual([
      "bin/libEGL.so",
    ]);
    expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(symlinkPath, "utf8")).toBe("cef-egl");
  });

  it("rejects symlinks that escape the bundle root", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-linux-"));
    const bundlePath = path.join(tempDir, "Milady");
    const outsidePath = path.join(tempDir, "outside.txt");
    const symlinkPath = path.join(bundlePath, "bin", "escaped.txt");

    fs.mkdirSync(path.join(bundlePath, "bin"), { recursive: true });
    fs.mkdirSync(path.join(bundlePath, "resources"), { recursive: true });
    fs.writeFileSync(outsidePath, "outside");
    fs.symlinkSync(
      path.relative(path.dirname(symlinkPath), outsidePath),
      symlinkPath,
    );

    expect(() => materializeLinuxBundleSymlinks(bundlePath)).toThrow(
      /refusing to materialize symlink outside bundle/i,
    );
  });
});

describe("shouldConsiderForCodesign", () => {
  it("keeps known native extensions even without executable bits", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const nativeModule = path.join(tempDir, "addon.node");
    fs.writeFileSync(nativeModule, "binary");
    const stats = fs.statSync(nativeModule);

    expect(shouldConsiderForCodesign(nativeModule, stats)).toBe(true);
  });

  it("keeps executable files without native extensions", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const helperBinary = path.join(tempDir, "spawn-helper");
    fs.writeFileSync(helperBinary, "#!/bin/sh\n");
    fs.chmodSync(helperBinary, 0o755);
    const stats = fs.statSync(helperBinary);

    expect(shouldConsiderForCodesign(helperBinary, stats)).toBe(true);
  });

  it("keeps known native helpers even when package mode bits are wrong", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const helperBinary = path.join(
      tempDir,
      "node-pty",
      "prebuilds",
      "darwin-arm64",
      "spawn-helper",
    );
    fs.mkdirSync(path.dirname(helperBinary), { recursive: true });
    fs.writeFileSync(helperBinary, "binary");
    fs.chmodSync(helperBinary, 0o644);
    const stats = fs.statSync(helperBinary);

    expect(shouldConsiderForCodesign(helperBinary, stats)).toBe(true);
  });

  it("skips regular non-native files", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const textFile = path.join(tempDir, "README.txt");
    fs.writeFileSync(textFile, "hello");
    const stats = fs.statSync(textFile);

    expect(shouldConsiderForCodesign(textFile, stats)).toBe(false);
  });
});
