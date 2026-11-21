import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanapos-unit-'))
const tsconfigPath = path.join(tmpDir, 'tsconfig.test.json')
const rootDir = process.cwd()

const testConfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'commonjs',
    moduleResolution: 'bundler',
    ignoreDeprecations: '6.0',
    typeRoots: [path.join(rootDir, 'node_modules/@types')],
    types: ['node'],
    esModuleInterop: true,
    strict: true,
    skipLibCheck: true,
    outDir: path.join(tmpDir, 'dist'),
    rootDir,
  },
  files: [
    path.join(rootDir, 'src/types/index.ts'),
    path.join(rootDir, 'src/config/shopConfig.ts'),
    path.join(rootDir, 'src/db/database.ts'),
    path.join(rootDir, 'src/utils/dateHelper.ts'),
    path.join(rootDir, 'src/utils/shopLocation.ts'),
    path.join(rootDir, 'src/utils/theme.ts'),
    path.join(rootDir, 'src/utils/dataAnalytics.ts'),
    path.join(rootDir, 'src/utils/googleSheetSync.ts'),
    path.join(rootDir, 'tests/unit/kanapos-logic.test.ts'),
  ],
}

fs.writeFileSync(tsconfigPath, JSON.stringify(testConfig, null, 2))

try {
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc', '-p', tsconfigPath],
    { stdio: 'inherit', shell: process.platform === 'win32' }
  )

  const compiledPkgJson = path.join(tmpDir, 'dist', 'package.json')
  fs.writeFileSync(compiledPkgJson, JSON.stringify({ type: 'commonjs' }))

  const compiledTestFile = path.join(tmpDir, 'dist', 'tests', 'unit', 'kanapos-logic.test.js')
  execFileSync(process.execPath, ['--test', compiledTestFile], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_PATH: path.join(rootDir, 'node_modules'),
    },
  })
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
