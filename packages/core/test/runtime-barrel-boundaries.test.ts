import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const sourceRoot = path.resolve(testDir, '../src')

const targetFiles = [
  'src/module/utils/Base.ts',
  'src/platform/bilibili/bilibili.ts',
  'src/platform/bilibili/push.ts',
  'src/platform/douyin/douyin.ts',
  'src/platform/douyin/push.ts',
  'src/platform/kuaishou/kuaishou.ts'
] as const

const barrelConstraints = [
  {
    file: 'src/module/utils/Base.ts',
    forbiddenRuntimeBarrels: ['@/module/utils']
  },
  {
    file: 'src/platform/bilibili/bilibili.ts',
    forbiddenRuntimeBarrels: ['@/platform/bilibili']
  },
  {
    file: 'src/platform/bilibili/push.ts',
    forbiddenRuntimeBarrels: ['@/module', '@/platform/bilibili']
  },
  {
    file: 'src/platform/douyin/push.ts',
    forbiddenRuntimeBarrels: ['@/module', '@/platform/douyin']
  },
  {
    file: 'src/platform/douyin/douyin.ts',
    forbiddenRuntimeBarrels: ['@/platform/douyin']
  },
  {
    file: 'src/platform/kuaishou/kuaishou.ts',
    forbiddenRuntimeBarrels: ['@/module', '@/platform/kuaishou']
  }
] as const

const listTypeScriptFiles = (directory: string): string[] => readdirSync(directory)
  .flatMap((name) => {
    const entry = path.join(directory, name)
    if (statSync(entry).isDirectory()) return listTypeScriptFiles(entry)
    return !name.endsWith('.d.ts') && /\.tsx?$/.test(name) ? [entry] : []
  })

const getRuntimeDependencySpecifiers = (filePath: string): string[] => {
  const source = readFileSync(filePath, 'utf8')
  let runtimeSource: string
  try {
    runtimeSource = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext
      },
      fileName: filePath
    }).outputText
  } catch (error) {
    throw new Error(`Failed to transpile ${path.relative(sourceRoot, filePath)}`, { cause: error })
  }
  const sourceFile = ts.createSourceFile(filePath, runtimeSource, ts.ScriptTarget.Latest, true)

  return sourceFile.statements.flatMap((statement) => {
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      if (statement.isTypeOnly) return []
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const runtimeExports = statement.exportClause.elements.filter(element => !element.isTypeOnly)
        return runtimeExports.length > 0 ? [statement.moduleSpecifier.text] : []
      }
      return [statement.moduleSpecifier.text]
    }

    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return []

    return [statement.moduleSpecifier.text]
  })
}

const resolveLocalDependency = (importer: string, specifier: string): string | undefined => {
  let candidate: string
  if (specifier.startsWith('@/')) {
    candidate = path.join(sourceRoot, specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    candidate = path.resolve(path.dirname(importer), specifier)
  } else {
    return undefined
  }

  for (const resolved of [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    path.join(candidate, 'index.ts'),
    path.join(candidate, 'index.tsx')
  ]) {
    try {
      if (statSync(resolved).isFile()) return resolved
    } catch {}
  }
  return undefined
}

const buildRuntimeImportGraph = (): Map<string, string[]> => new Map(
  listTypeScriptFiles(sourceRoot).map(filePath => [
    filePath,
    getRuntimeDependencySpecifiers(filePath)
      .map(specifier => resolveLocalDependency(filePath, specifier))
      .filter((dependency): dependency is string => Boolean(dependency))
  ])
)

const findStronglyConnectedComponents = (graph: Map<string, string[]>): string[][] => {
  let nextIndex = 0
  const index = new Map<string, number>()
  const lowLink = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: string[][] = []

  const visit = (node: string): void => {
    index.set(node, nextIndex)
    lowLink.set(node, nextIndex)
    nextIndex += 1
    stack.push(node)
    onStack.add(node)

    for (const dependency of graph.get(node) ?? []) {
      if (!index.has(dependency)) {
        visit(dependency)
        lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(dependency)!))
      } else if (onStack.has(dependency)) {
        lowLink.set(node, Math.min(lowLink.get(node)!, index.get(dependency)!))
      }
    }

    if (lowLink.get(node) !== index.get(node)) return

    const component: string[] = []
    let member: string
    do {
      member = stack.pop()!
      onStack.delete(member)
      component.push(member)
    } while (member !== node)
    components.push(component)
  }

  for (const node of graph.keys()) {
    if (!index.has(node)) visit(node)
  }
  return components
}

describe('runtime barrel boundaries', () => {
  it.each(barrelConstraints)('$file does not import a barrel that exports itself', ({ file, forbiddenRuntimeBarrels }) => {
    const filePath = path.resolve(testDir, '..', file)
    const runtimeImports = getRuntimeDependencySpecifiers(filePath)

    for (const barrel of forbiddenRuntimeBarrels) {
      expect(runtimeImports, `${file} must import leaf modules instead of ${barrel}`).not.toContain(barrel)
    }
  })

  it('keeps the target modules out of every static runtime import cycle', () => {
    const components = findStronglyConnectedComponents(buildRuntimeImportGraph())
      .filter(component => component.length > 1)
    const cyclicFiles = new Set(components.flat())

    for (const file of targetFiles) {
      const absolutePath = path.resolve(testDir, '..', file)
      const component = components.find(candidate => candidate.includes(absolutePath)) ?? []
      const relativeComponent = component.map(member => path.relative(sourceRoot, member)).sort()
      expect(cyclicFiles, `${file} must not belong to a runtime import cycle: ${relativeComponent.join(', ')}`)
        .not.toContain(path.resolve(testDir, '..', file))
    }
  })
})
