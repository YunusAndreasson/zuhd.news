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

function deprecatedTag(symbol) {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const tag = resolved.getJsDocTags(checker).find((entry) => entry.name === 'deprecated');
  if (!tag) return null;
  const detail = tag.text
    ?.map((part) => part.text)
    .join('')
    .trim();
  return { symbol: resolved.getName(), detail: detail || 'Deprecated API' };
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

function isDeprecatedUse(node) {
  const call = resolvedCallFor(node);
  if (!call) return true;

  // Overloaded functions can carry a deprecation tag on only one overload.
  // TypeScript merges that tag onto the symbol, so inspect the signature
  // selected for this call before reporting it.
  const signature = checker.getResolvedSignature(call);
  if (!signature) return true;
  const signatureTags = signature.getJsDocTags();
  const hasDeprecatedSignature = signatureTags.some((entry) => entry.name === 'deprecated');
  return hasDeprecatedSignature;
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

  const record = (node, deprecated) => {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
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
      const deprecated = symbol ? deprecatedTag(symbol) : null;
      if (deprecated && isDeprecatedUse(node)) record(node, deprecated);
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
