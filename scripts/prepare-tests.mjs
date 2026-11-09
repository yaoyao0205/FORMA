// 把主进程的纯逻辑模块（解析器 / 哈希 / 绕序）编译成可直接被 node --test 加载的 ESM，
// 避免为了测试而引入额外的运行时（tsx / vitest）。
import { build } from 'esbuild'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outdir = path.join(root, 'test/.build')

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })

await build({
  entryPoints: {
    parsers: path.join(root, 'src/main/parsers/index.ts'),
    types: path.join(root, 'src/main/parsers/types.ts'),
    xml: path.join(root, 'src/main/parsers/xml.ts'),
    orient: path.join(root, 'src/main/parsers/orient.ts'),
    hash: path.join(root, 'src/main/utils/hash.ts'),
    validate: path.join(root, 'src/main/utils/validate.ts')
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outdir,
  outExtension: { '.js': '.mjs' },
  external: ['fflate'],
  logLevel: 'warning'
})

console.log('[test] modules compiled ->', path.relative(root, outdir))
