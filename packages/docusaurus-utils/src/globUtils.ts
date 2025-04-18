/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Globby/Micromatch are the 2 libs we use in Docusaurus consistently

import path from 'path';
import Micromatch from 'micromatch'; // Note: Micromatch is used by Globby
import {addSuffix} from '@docusaurus/utils-common';
import Globby from 'globby';
import {posixPath} from './pathUtils';

/** A re-export of the globby instance. */
export {Globby};

/**
 * The default glob patterns we ignore when sourcing content.
 * - Ignore files and folders starting with `_` recursively
 * - Ignore tests
 */
export const GlobExcludeDefault = [
  '**/_*.{js,jsx,ts,tsx,md,mdx}',
  '**/_*/**',
  '**/*.test.{js,jsx,ts,tsx}',
  '**/__tests__/**',
];

type Matcher = (str: string) => boolean;

/**
 * A very thin wrapper around `Micromatch.makeRe`.
 *
 * @see {@link createAbsoluteFilePathMatcher}
 * @param patterns A list of glob patterns. If the list is empty, it defaults to
 * matching none.
 * @returns A matcher handle that tells if a file path is matched by any of the
 * patterns.
 */
export function createMatcher(patterns: string[]): Matcher {
  if (patterns.length === 0) {
    // `/(?:)/.test("foo")` is `true`
    return () => false;
  }
  const regexp = new RegExp(
    patterns.map((pattern) => Micromatch.makeRe(pattern).source).join('|'),
  );
  return (str) => regexp.test(str);
}

/**
 * We use match patterns like `"** /_* /**"` (ignore the spaces), where `"_*"`
 * should only be matched within a subfolder. This function would:
 * - Match `/user/sebastien/website/docs/_partials/xyz.md`
 * - Ignore `/user/_sebastien/website/docs/partials/xyz.md`
 *
 * @param patterns A list of glob patterns.
 * @param rootFolders A list of root folders to resolve the glob from.
 * @returns A matcher handle that tells if a file path is matched by any of the
 * patterns, resolved from the first root folder that contains the path.
 * @throws Throws when the returned matcher receives a path that doesn't belong
 * to any of the `rootFolders`.
 */
export function createAbsoluteFilePathMatcher(
  patterns: string[],
  rootFolders: string[],
): Matcher {
  const matcher = createMatcher(patterns);

  function getRelativeFilePath(absoluteFilePath: string) {
    const rootFolder = rootFolders.find((folderPath) =>
      [addSuffix(folderPath, '/'), addSuffix(folderPath, '\\')].some((p) =>
        absoluteFilePath.startsWith(p),
      ),
    );
    if (!rootFolder) {
      throw new Error(
        `createAbsoluteFilePathMatcher unexpected error, absoluteFilePath=${absoluteFilePath} was not contained in any of the root folders: ${rootFolders.join(
          ', ',
        )}`,
      );
    }
    return path.relative(rootFolder, absoluteFilePath);
  }

  return (absoluteFilePath: string) =>
    matcher(getRelativeFilePath(absoluteFilePath));
}

// Globby that fix Windows path patterns
// See https://github.com/facebook/docusaurus/pull/4222#issuecomment-795517329
export async function safeGlobby(
  patterns: string[],
  options?: Globby.GlobbyOptions,
): Promise<string[]> {
  // Required for Windows support, as paths using \ should not be used by globby
  // (also using the windows hard drive prefix like c: is not a good idea)
  const globPaths = patterns.map((dirPath) =>
    posixPath(path.relative(process.cwd(), dirPath)),
  );

  return Globby(globPaths, options);
}

export const isTranslatableSourceFile: (filePath: string) => boolean = (() => {
  // We only support extracting source code translations from these extensions
  const extensionsAllowed = new Set([
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    // TODO support md/mdx too? (may be overkill)
    // need to compile the MDX to JSX first and remove front matter
    // '.md',
    // '.mdx',
  ]);

  const isBlacklistedFilePath = (filePath: string) => {
    // We usually extract from ts files, unless they are .d.ts files
    return filePath.endsWith('.d.ts');
  };

  return (filePath): boolean => {
    const ext = path.extname(filePath);
    return extensionsAllowed.has(ext) && !isBlacklistedFilePath(filePath);
  };
})();

// A bit weird to put this here, but it's used by core + theme-translations
export async function globTranslatableSourceFiles(
  patterns: string[],
): Promise<string[]> {
  const filePaths = await safeGlobby(patterns);
  return filePaths.filter(isTranslatableSourceFile);
}
