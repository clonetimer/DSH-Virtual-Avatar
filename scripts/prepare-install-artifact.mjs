import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const [metadataPath, outputDirectory] = process.argv.slice(2)
if (!metadataPath || !outputDirectory) throw new Error('usage: node scripts/prepare-install-artifact.mjs <npm-pack-json> <output-dir>')
const [metadata] = JSON.parse(readFileSync(metadataPath, 'utf8'))
if (!metadata?.filename || !metadata?.name || !metadata?.version) throw new Error('npm pack metadata is incomplete')
const source = resolve(metadata.filename)
const filename = basename(metadata.filename)
const destination = join(resolve(outputDirectory), filename)
copyFileSync(source, destination)
const bytes = readFileSync(destination)
const sha256 = createHash('sha256').update(bytes).digest('hex')
writeFileSync(destination + '.sha256', sha256 + '  ' + filename + '\n')
writeFileSync(join(resolve(outputDirectory), 'package-info.json'), JSON.stringify({
  name: metadata.name,
  version: metadata.version,
  filename,
  byteLength: bytes.length,
  sha256,
  dshTarget: '0.2.2-rc.1',
  nodeMinimum: '24.9.0',
  platforms: ['Windows Web', 'Windows Desktop'],
}, null, 2) + '\n')
process.stdout.write(JSON.stringify({ filename, byteLength: bytes.length, sha256 }) + '\n')
