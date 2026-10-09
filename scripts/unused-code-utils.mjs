import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const codePattern = /\.(?:tsx?|[mc]?js)$/;
const testPattern = /\.test\.(?:tsx?|[mc]?js)$/;

/** Exceptions are specific exported contracts, never whole directories. */
export function reviewUnusedExports(candidates, exceptions) {
  if (!Array.isArray(exceptions)) throw new Error("导出例外必须是数组");
  const reviewed = new Map();
  for (const entry of exceptions) {
    if (!entry || typeof entry.file !== "string" || !entry.file || typeof entry.name !== "string" || !entry.name || typeof entry.reason !== "string" || !entry.reason.trim()) throw new Error("导出例外必须提供具体文件、名称和保留理由");
    const key = `${entry.file}:${entry.name}`;
    if (reviewed.has(key)) throw new Error(`重复导出例外：${key}`);
    reviewed.set(key, entry.reason);
  }
  return {
    unexpected: candidates.filter((candidate) => !reviewed.has(`${candidate.file}:${candidate.name}`)),
    retained: candidates.filter((candidate) => reviewed.has(`${candidate.file}:${candidate.name}`)).map((candidate) => ({...candidate, reason: reviewed.get(`${candidate.file}:${candidate.name}`)})),
  };
}

function collect(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(file) : codePattern.test(file) && !file.endsWith(".d.ts") ? [file] : [];
  });
}

/** Literal imports, re-exports, require and worker URLs all form graph edges.
 * Ambient .d.ts files are compiler inputs, not unreachable runtime modules. */
export function inspectUnusedCode(root) {
  const files = ["src", "server", "scripts"].flatMap((directory) => collect(path.join(root, directory)));
  const configPath = path.join(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  const moduleCache = ts.createModuleResolutionCache(root, (name) => name, options);
  const sources = new Map(files.map((file) => [file, ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)]));
  const edges = new Map(files.map((file) => [file, new Set()]));

  function resolve(specifier, file) {
    const clean = specifier.replace(/\?.*$/, "");
    const resolved = ts.resolveModuleName(clean, file, options, ts.sys, moduleCache).resolvedModule?.resolvedFileName;
    if (resolved && sources.has(resolved)) return resolved;
    // A worker URL commonly names the source extension explicitly.
    const relative = path.resolve(path.dirname(file), clean);
    return clean.startsWith(".") && sources.has(relative) ? relative : null;
  }

  for (const [file, source] of sources) {
    function visit(node) {
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
      if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteralLike(node.arguments[0]) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) specifier = node.arguments[0].text;
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" && node.arguments?.length === 2 && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[1].getText(source) === "import.meta.url") specifier = node.arguments[0].text;
      if (specifier) {
        const dependency = resolve(specifier, file);
        if (dependency) edges.get(file).add(dependency);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }

  const runtimeEntries = ["src/main.tsx", "server/index.ts", "server/dailyReportCli.ts"].map((file) => path.join(root, file)).filter((file) => sources.has(file));
  const testEntries = files.filter((file) => testPattern.test(file));
  const toolEntries = files.filter((file) => file.startsWith(path.join(root, "scripts") + path.sep) || /Cli\.ts$/.test(file));
  function reachable(entries) {
    const visited = new Set();
    const pending = [...entries];
    while (pending.length) {
      const file = pending.pop();
      if (visited.has(file)) continue;
      visited.add(file);
      pending.push(...(edges.get(file) || []));
    }
    return visited;
  }
  const runtime = reachable(runtimeEntries);
  const tests = reachable(testEntries);
  const tools = reachable(toolEntries);
  const relative = (file) => path.relative(root, file).split(path.sep).join("/");
  const unusedModules = files.filter((file) => !runtime.has(file) && !tests.has(file) && !tools.has(file)).map(relative).sort();

  // Use symbols rather than name-text matching: aliased imports and namespace
  // property access must count, but simply re-exporting a name must not.
  const program = ts.createProgram({rootNames: files, options});
  const checker = program.getTypeChecker();
  const candidates = new Map();
  for (const file of files.filter((file) => !file.startsWith(path.join(root, "scripts") + path.sep) && !testPattern.test(file))) {
    const source = program.getSourceFile(file);
    const defaultNames = new Set();
    for (const statement of source?.statements || []) {
      if (ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression)) defaultNames.add(statement.expression.text);
      if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const specifier of statement.exportClause.elements) if (specifier.name.text === "default") defaultNames.add((specifier.propertyName || specifier.name).text);
      }
    }
    for (const node of source?.statements || []) {
      if (!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      // Lazy page loaders consume a module's default export, not its local
      // declaration name. Module reachability is the guard for these entries.
      if (node.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) continue;
      const names = ts.isVariableStatement(node) ? node.declarationList.declarations.map((declaration) => declaration.name) : ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ? [node.name] : [];
      for (const name of names) {
        if (!name || !ts.isIdentifier(name) || defaultNames.has(name.text)) continue;
        candidates.set(name.parent, {file: relative(file), name: name.text, line: source.getLineAndCharacterOfPosition(name.getStart()).line + 1, declaration: name, references: 0});
      }
    }
  }
  const candidatesByName = new Map();
  for (const candidate of candidates.values()) {
    const matches = candidatesByName.get(candidate.name) || [];
    matches.push(candidate);
    candidatesByName.set(candidate.name, matches);
  }
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      // Router lazy loaders select named exports by a literal string, so the
      // compiler has no identifier reference for these live page components.
      if (ts.isStringLiteralLike(node) && (ts.isCallExpression(node.parent) || ts.isElementAccessExpression(node.parent))) {
        const matches = candidatesByName.get(node.text);
        if (matches) {
          const dependencies = reachable([file]);
          for (const candidate of matches) if (dependencies.has(path.join(root, candidate.file))) candidate.references += 1;
        }
      }
      if (ts.isIdentifier(node)) {
        let symbol = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
        if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        const declarations = [...(symbol?.declarations || [])];
        // Default exports use the module's default symbol. Destructuring a
        // dynamic import has a binding symbol; its call signature still points
        // to the original function declaration.
        if (declarations.some((declaration) => ts.isBindingElement(declaration))) {
          declarations.push(...checker.getTypeAtLocation(node).getCallSignatures().map((signature) => signature.declaration).filter(Boolean));
        }
        for (const declaration of declarations) {
          const candidate = candidates.get(declaration);
          if (candidate && candidate.declaration !== node) candidate.references += 1;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const unusedExports = [...candidates.values()].filter((candidate) => candidate.references === 0).map(({declaration, references, ...candidate}) => candidate).sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
  return {unusedModules, unusedExports, files: files.length};
}
