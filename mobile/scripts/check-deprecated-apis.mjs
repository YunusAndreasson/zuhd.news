#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = process.cwd();
const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error(`No tsconfig.json found under ${projectRoot}`);

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const findings = new Map();
const ALLOW_MARKER = /\/[/*]\s*deprecated-api-allowed:\s*\S/;
const COMMENT_LINE = /^\s*\/[/*]/;

function describe(name, tag) {
  const detail = ts.getTextOfJSDocComment(tag.comment)?.trim();
  return { symbol: name, detail: detail || 'Deprecated API' };
}

// A name is deprecated when every one of its declarations says so in its own
// comment, which is the rule TypeScript strikes a name through by. Two looser
// readings each misfire: `getJsDocTags()` hands back the tag of a base member a
// declaration overrides without a comment of its own, and "any declaration"
// marks a whole overloaded function, or a prop on an intersection, deprecated
// for one deprecated member. A call to one deprecated overload is caught by the
// signature it resolves to (`deprecatedCall`).
function deprecatedTag(symbol) {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declarations = resolved.declarations ?? [];
  if (declarations.length === 0) return null;
  let first = null;
  for (const declaration of declarations) {
    const tag = ts.getJSDocDeprecatedTag(declaration);
    if (!tag) return null;
    first ??= tag;
  }
  return describe(resolved.getName(), first);
}

function resolvedCallFor(node) {
  if (ts.isCallExpression(node.parent) && node.parent.expression === node) {
    return node.parent;
  }
  if (
    ts.isPropertyAccessExpression(node.parent) &&
    node.parent.name === node &&
    ts.isCallExpression(node.parent.parent) &&
    node.parent.parent.expression === node.parent
  ) {
    return node.parent.parent;
  }
  return null;
}

// A call to the one deprecated overload of a function whose other overloads
// are current: the name is not deprecated (`deprecatedTag`), the call is.
function deprecatedCall(node, symbol) {
  const call = resolvedCallFor(node);
  if (!call) return null;
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (!declaration || ts.isJSDocSignature(declaration)) return null;
  const tag = ts.getJSDocDeprecatedTag(declaration);
  return tag ? describe(symbol.getName(), tag) : null;
}

// A JSX attribute or an option-object key resolves, through
// `getSymbolAtLocation`, to the *local* attribute or property it declares — not
// to the prop or option it fills — so a deprecated prop (`<Canvas onLayout>`)
// or config key (`interruptionModeAndroid`) passed the check above in silence.
// Those are looked up on the type the value is being written into instead.
function deprecatedMemberOf(type, name) {
  if (!type) return null;
  const parts = type.isUnion() ? type.types : [type];
  for (const part of parts) {
    const property = checker.getPropertyOfType(checker.getApparentType(part), name);
    const deprecated = property ? deprecatedTag(property) : null;
    if (deprecated) return deprecated;
  }
  return null;
}

function writtenMember(node) {
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
    return { nameNode: node.name, type: checker.getContextualType(node.parent) };
  }
  const isMember =
    (ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node) ||
      ts.isMethodDeclaration(node)) &&
    ts.isObjectLiteralExpression(node.parent) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name));
  if (isMember) {
    return { nameNode: node.name, type: checker.getContextualType(node.parent) };
  }
  return null;
}

for (const sourceFile of program.getSourceFiles()) {
  if (
    sourceFile.isDeclarationFile ||
    sourceFile.fileName.includes(`${path.sep}node_modules${path.sep}`)
  ) {
    continue;
  }

  // TypeScript's own line starts, so a line here is the line it reports.
  const lineStarts = sourceFile.getLineStarts();
  const lineText = (line) =>
    line < 0 || line >= lineStarts.length
      ? ''
      : sourceFile.text.slice(lineStarts[line], lineStarts[line + 1] ?? sourceFile.text.length);
  const record = (node, deprecated) => {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    // A use that cannot move yet (the replacement does not exist until the
    // dependency's next major) carries `deprecated-api-allowed: <why>` in a
    // comment at the end of its line, or alone on the line above. The reason is
    // required, so the exception says what has to happen before it can go. A
    // marker that ends one line does not reach the next.
    const above = lineText(start.line - 1);
    const marked =
      ALLOW_MARKER.test(lineText(start.line)) ||
      (COMMENT_LINE.test(above) && ALLOW_MARKER.test(above));
    if (marked) return;
    const relative = path.relative(projectRoot, sourceFile.fileName);
    const key = `${relative}:${start.line + 1}:${start.character + 1}:${deprecated.symbol}`;
    findings.set(key, {
      file: relative,
      line: start.line + 1,
      column: start.character + 1,
      ...deprecated,
    });
  };

  const visit = (node) => {
    const member = writtenMember(node);
    if (member) {
      const deprecated = deprecatedMemberOf(member.type, member.nameNode.text);
      if (deprecated) record(member.nameNode, deprecated);
    }
    // Checking only identifier references avoids reporting an entire property
    // access twice while still resolving imported functions, members, types,
    // and enum values through TypeScript's real module graph.
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      const deprecated = symbol ? (deprecatedCall(node, symbol) ?? deprecatedTag(symbol)) : null;
      if (deprecated) record(node, deprecated);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

if (findings.size === 0) {
  console.log('No deprecated dependency APIs found.');
  process.exit(0);
}

for (const finding of findings.values()) {
  console.error(
    `${finding.file}:${finding.line}:${finding.column} ${finding.symbol} — ${finding.detail}`,
  );
}
console.error(`\nFound ${findings.size} deprecated dependency API reference(s).`);
process.exitCode = 1;
