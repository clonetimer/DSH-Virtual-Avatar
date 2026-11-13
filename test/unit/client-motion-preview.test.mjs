import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { Script } from 'node:vm'

const source = readFileSync(new URL('../../src/client/companion.mjs', import.meta.url), 'utf8')
const start = source.indexOf('const MAX_MOTION_PREVIEW_FILES')
const end = source.indexOf('\nfunction Companion()', start)
assert.ok(start > 0 && end > start, 'native folder scanner is included in the client source')
const scannerSource = source.slice(start, end)
const readFolder = new Script(scannerSource + '\nreadDyberPetPreviewFolder',
  { filename: 'client-dyberpet-preview.js' }).runInNewContext({})

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

function fakeFile(path, data) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data)
  return {
    name: path.split('/').at(-1),
    webkitRelativePath: path,
    size: body.length,
    text: async () => body.toString('utf8'),
    slice(start, end) {
      const part = body.subarray(start, end)
      return {
        arrayBuffer: async () => Uint8Array.from(part).buffer,
      }
    },
  }
}

const validFiles = () => [
  fakeFile('WhalePack/pet_conf.json', JSON.stringify({ default: 'idle' })),
  fakeFile('WhalePack/act_conf.json', JSON.stringify({ idle: { images: 'stand', act_num: 2 } })),
  fakeFile('WhalePack/action/stand_1.png', PNG),
  fakeFile('WhalePack/action/stand_0.png', PNG),
]

test('native folder scanner accepts an actual DyberPet directory shape without reading all image bytes', async () => {
  const folder = await readFolder(validFiles())
  assert.equal(folder.roleName, 'WhalePack')
  assert.equal(folder.petConfig.default, 'idle')
  assert.equal(folder.actConfig.idle.images, 'stand')
  assert.deepEqual(Array.from(folder.frameFiles).sort(), ['action/stand_0.png', 'action/stand_1.png'])
  assert.equal(folder.frameEntries.length, 2)
})

test('native folder scanner rejects missing configuration and invalid image bytes', async () => {
  await assert.rejects(
    () => readFolder(validFiles().filter(file => file.name !== 'act_conf.json')),
    /缺少 act_conf\.json/,
  )
  const files = validFiles()
  files[3] = fakeFile('WhalePack/action/stand_0.png', 'not png')
  await assert.rejects(() => readFolder(files), /不是有效的 PNG/)
})

test('native folder scanner rejects unsafe frame filenames and mixed role roots', async () => {
  const files = validFiles()
  files[3] = fakeFile('WhalePack/action/../stand_0.png', PNG)
  await assert.rejects(() => readFolder(files), /动作帧文件名或大小异常/)
  await assert.rejects(
    () => readFolder([...validFiles(), fakeFile('Other/pet_conf.json', '{}')]),
    /只有一份 pet_conf\.json/,
  )
})
