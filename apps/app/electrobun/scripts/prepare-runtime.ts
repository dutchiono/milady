import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
};

const rootDir = path.resolve(import.meta.dir, "..");
const workspaceRootDir = path.resolve(rootDir, "../../..");
const sourceDistDir = path.resolve(rootDir, "../electron/milady-dist");
const sourceAssetsDir = path.resolve(rootDir, "../electron/assets");
const bunStoreDir = path.join(workspaceRootDir, "node_modules", ".bun");
const stagedRootDir = path.join(rootDir, "staged");
const stagedDistDir = path.join(stagedRootDir, "md");
const stagedAssetsDir = path.join(stagedRootDir, "assets");
const stagedNodeModulesDir = path.join(stagedDistDir, "node_modules");

const PRUNE_DIR_NAMES = new Set([
  ".github",
  "__tests__",
  "benchmark",
  "benchmarks",
  "coverage",
  "doc",
  "docs",
  "example",
  "examples",
  "test",
  "tests",
]);

const PRUNE_FILE_SUFFIXES = [
  ".d.ts",
  ".map",
  ".md",
  ".mdx",
  ".markdown",
  ".mkd",
];

const PRUNE_FILE_NAMES = /^(README|CHANGELOG|LICENSE|LICENCE|NOTICE)(\.|$)/i;

const PRUNE_PATH_SNIPPETS = [
  `${path.sep}whisper-node${path.sep}lib${path.sep}whisper.cpp${path.sep}bindings${path.sep}`,
  `${path.sep}whisper-node${path.sep}lib${path.sep}whisper.cpp${path.sep}examples${path.sep}`,
  `${path.sep}@tensorflow${path.sep}tfjs-node${path.sep}build-tmp-`,
];

let removedDirectories = 0;
let removedFiles = 0;
let vendoredPackages = 0;
const vendorWarnings: string[] = [];

function shouldPruneDirectory(dirPath: string): boolean {
  const name = path.basename(dirPath).toLowerCase();
  if (PRUNE_DIR_NAMES.has(name)) {
    return true;
  }

  return PRUNE_PATH_SNIPPETS.some((snippet) => dirPath.includes(snippet));
}

function shouldPruneFile(filePath: string): boolean {
  const name = path.basename(filePath);
  const lowerName = name.toLowerCase();

  if (PRUNE_FILE_NAMES.test(name)) {
    return true;
  }

  if (PRUNE_FILE_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))) {
    return true;
  }

  return PRUNE_PATH_SNIPPETS.some((snippet) => filePath.includes(snippet));
}

function pruneTree(dirPath: string): void {
  for (const entry of readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (shouldPruneDirectory(fullPath)) {
        rmSync(fullPath, { recursive: true, force: true });
        removedDirectories += 1;
        continue;
      }

      pruneTree(fullPath);
      continue;
    }

    if (shouldPruneFile(fullPath)) {
      unlinkSync(fullPath);
      removedFiles += 1;
    }
  }
}

function getLongestPathLength(dirPath: string): number {
  let longest = 0;

  function walk(currentPath: string): void {
    for (const entry of readdirSync(currentPath)) {
      const fullPath = path.join(currentPath, entry);
      const stats = statSync(fullPath);
      longest = Math.max(longest, fullPath.length);
      if (stats.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(dirPath);
  return longest;
}

function readPackageJson(packageDir: string): PackageJson | null {
  const packageJsonPath = path.join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function parseVersion(version: string): number[] {
  return version
    .split(".")
    .map((part) => Number.parseInt(part.replace(/[^0-9].*$/, ""), 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(a: string, b: string): number {
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);
  const length = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function preferredMajor(range: string | undefined): number | null {
  if (!range) {
    return null;
  }

  const match = range.match(/(\d+)\./);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

function packagePath(baseDir: string, packageName: string): string {
  return path.join(baseDir, ...packageName.split("/"));
}

function findBunStorePackageDir(
  packageName: string,
  range: string | undefined,
): string | null {
  if (!existsSync(bunStoreDir)) {
    return null;
  }

  const wantedMajor = preferredMajor(range);
  let bestDir: string | null = null;
  let bestVersion = "0.0.0";
  let bestMajorMatch = false;

  for (const entry of readdirSync(bunStoreDir)) {
    const candidateDir = packagePath(
      path.join(bunStoreDir, entry, "node_modules"),
      packageName,
    );
    const candidatePackage = readPackageJson(candidateDir);
    if (!candidatePackage || candidatePackage.name !== packageName) {
      continue;
    }

    const version = candidatePackage.version ?? "0.0.0";
    const versionMajor = parseVersion(version)[0] ?? 0;
    const majorMatches = wantedMajor === null || versionMajor === wantedMajor;

    if (bestDir === null) {
      bestDir = candidateDir;
      bestVersion = version;
      bestMajorMatch = majorMatches;
      continue;
    }

    if (majorMatches && !bestMajorMatch) {
      bestDir = candidateDir;
      bestVersion = version;
      bestMajorMatch = true;
      continue;
    }

    if (majorMatches === bestMajorMatch && compareVersions(version, bestVersion) > 0) {
      bestDir = candidateDir;
      bestVersion = version;
      bestMajorMatch = majorMatches;
    }
  }

  return bestDir;
}

function versionMatchesRange(
  packageDir: string,
  range: string | undefined,
): boolean {
  if (!existsSync(packageDir)) {
    return false;
  }

  const packageJson = readPackageJson(packageDir);
  if (!packageJson?.version) {
    return false;
  }

  const wantedMajor = preferredMajor(range);
  if (wantedMajor === null) {
    return true;
  }

  return (parseVersion(packageJson.version)[0] ?? 0) === wantedMajor;
}

function ensurePackageInStage(
  packageName: string,
  range: string | undefined,
  requesterDir: string,
  seen = new Set<string>(),
): void {
  const cacheKey = `${requesterDir}::${packageName}`;
  if (seen.has(cacheKey)) {
    return;
  }
  seen.add(cacheKey);

  const requesterNodeModulesDir = path.join(requesterDir, "node_modules");
  const localPackageDir = packagePath(requesterNodeModulesDir, packageName);
  const rootPackageDir = packagePath(stagedNodeModulesDir, packageName);

  let resolvedPackageDir: string | null = null;

  if (versionMatchesRange(localPackageDir, range)) {
    resolvedPackageDir = localPackageDir;
  } else if (versionMatchesRange(rootPackageDir, range)) {
    resolvedPackageDir = rootPackageDir;
  } else {
    const bunStorePackageDir = findBunStorePackageDir(packageName, range);
    if (!bunStorePackageDir) {
      vendorWarnings.push(`${packageName}${range ? `@${range}` : ""}`);
      return;
    }

    mkdirSync(path.dirname(localPackageDir), { recursive: true });
    rmSync(localPackageDir, { recursive: true, force: true });
    cpSync(bunStorePackageDir, localPackageDir, {
      recursive: true,
      dereference: true,
    });
    vendoredPackages += 1;
    resolvedPackageDir = localPackageDir;
  }

  const packageJson = readPackageJson(resolvedPackageDir);
  if (!packageJson?.dependencies) {
    return;
  }

  for (const [dependencyName, dependencyRange] of Object.entries(packageJson.dependencies)) {
    ensurePackageInStage(dependencyName, dependencyRange, resolvedPackageDir, seen);
  }
}

function ensureRuntimeDependencyClosure(): void {
  if (!existsSync(stagedNodeModulesDir)) {
    return;
  }

  const packageDirs: string[] = [];

  for (const entry of readdirSync(stagedNodeModulesDir)) {
    const entryPath = path.join(stagedNodeModulesDir, entry);
    if (!statSync(entryPath).isDirectory()) {
      continue;
    }

    if (entry.startsWith("@")) {
      for (const scopedEntry of readdirSync(entryPath)) {
        const scopedPath = path.join(entryPath, scopedEntry);
        if (statSync(scopedPath).isDirectory()) {
          packageDirs.push(scopedPath);
        }
      }
      continue;
    }

    packageDirs.push(entryPath);
  }

  for (const packageDir of packageDirs) {
    const packageJson = readPackageJson(packageDir);
    if (!packageJson?.dependencies) {
      continue;
    }

    for (const [dependencyName, dependencyRange] of Object.entries(packageJson.dependencies)) {
      ensurePackageInStage(dependencyName, dependencyRange, packageDir);
    }
  }
}

if (!existsSync(sourceDistDir)) {
  throw new Error(`Source milady-dist missing: ${sourceDistDir}`);
}

if (!existsSync(sourceAssetsDir)) {
  throw new Error(`Source assets missing: ${sourceAssetsDir}`);
}

rmSync(stagedRootDir, { recursive: true, force: true });
mkdirSync(stagedRootDir, { recursive: true });

cpSync(sourceDistDir, stagedDistDir, { recursive: true, dereference: true });
cpSync(sourceAssetsDir, stagedAssetsDir, { recursive: true, dereference: true });

pruneTree(stagedDistDir);
ensureRuntimeDependencyClosure();

const longestPath = getLongestPathLength(stagedDistDir);

console.log(
  `[prepare-runtime] staged runtime at ${stagedDistDir} (removed ${removedDirectories} dirs, ${removedFiles} files, vendored ${vendoredPackages} packages, longest path ${longestPath})`,
);

if (vendorWarnings.length > 0) {
  console.warn(
    `[prepare-runtime] missing hoisted packages: ${vendorWarnings.sort().join(", ")}`,
  );
}
