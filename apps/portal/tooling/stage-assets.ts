import { copyFile, lstat, mkdir, realpath, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assets from '../legacy-assets.json' with { type: 'json' }

const root = fileURLToPath(new URL('../../../', import.meta.url))
export const stagingDirectory = fileURLToPath(new URL('../.legacy-assets/', import.meta.url))

export async function stageAssets() {
  // A reviewed file list, never a recursive copy of the checkout.
  // Validate first so a missing submodule cannot silently yield a partial build.
  for (const path of assets) {
    const source = resolve(root, path)
    try {
      if (!(await lstat(source)).isFile() || await realpath(source) !== source) {
        throw new Error('Expected a regular file without symlinks')
      }
    } catch (error) {
      throw new Error(`Missing or unsafe runtime asset: ${path}. See Readme.md for pinned submodule setup.`, { cause: error })
    }
  }
  await rm(stagingDirectory, { recursive: true, force: true })
  for (const path of assets) {
    const destination = resolve(stagingDirectory, path)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(resolve(root, path), destination)
  }
}
