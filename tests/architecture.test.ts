import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const layers = ["shared", "entities", "features", "widgets", "pages", "app"];
const root = resolve("webapp/src");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory()
      ? files(join(dir, item.name))
      : /\.(ts|tsx)$/.test(item.name)
        ? [join(dir, item.name)]
        : [],
  );
}
test("FSD import direction and slice public APIs are enforced", () => {
  const failures: string[] = [];
  for (const file of files(root).filter((f) => !f.includes(".test."))) {
    const parts = relative(root, file).split(sep);
    const layer = layers.indexOf(parts[0]);
    if (layer < 0) continue;
    const ast = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of ast.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;
      const path = statement.moduleSpecifier.text;
      if (!path.startsWith(".")) continue;
      const target = resolve(dirname(file), path);
      const imported = relative(root, target).split(sep);
      const targetLayer = layers.indexOf(imported[0]);
      if (targetLayer < 0) {
        if (parts[0] !== "shared")
          failures.push(
            `${relative(root, file)}: external local import ${path}`,
          );
        continue;
      }
      const sameSlice =
        parts[0] === imported[0] &&
        (parts[1] === imported[1] ||
          parts[0] === "app" ||
          parts[0] === "shared");
      if (sameSlice) continue;
      if (targetLayer >= layer)
        failures.push(`${relative(root, file)}: forbidden layer ${path}`);
      const publicApi =
        imported.length === 2 ||
        (imported.length === 3 && /^index(?:\.[jt]sx?)?$/.test(imported[2]));
      if (!publicApi)
        failures.push(`${relative(root, file)}: deep slice import ${path}`);
    }
  }
  assert.deepEqual(failures, []);
  for (const layer of layers) assert.equal(existsSync(join(root, layer)), true);
});
test("production source has no comments, explicit any or misplaced type declarations", () => {
  const failures: string[] = [];
  for (const file of [
    ...files(root),
    ...files(resolve("server")),
    ...files(resolve("src")),
    ...files(resolve("contracts")),
    ...files(resolve("types")),
  ].filter((f) => !f.includes(".test."))) {
    const source = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.JSX,
      source,
    );
    let token: ts.SyntaxKind;
    while ((token = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken)
      if (
        token === ts.SyntaxKind.SingleLineCommentTrivia ||
        token === ts.SyntaxKind.MultiLineCommentTrivia
      )
        failures.push(`${relative(process.cwd(), file)}: comment`);
    function check(node: ts.Node) {
      if (node.kind === ts.SyntaxKind.AnyKeyword)
        failures.push(`${relative(process.cwd(), file)}: explicit any`);
      if (
        (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
        !file.includes(`${sep}types${sep}`) &&
        !file.endsWith(`${sep}types.ts`)
      )
        failures.push(
          `${relative(process.cwd(), file)}: type outside types file`,
        );
      ts.forEachChild(node, check);
    }
    check(ast);
  }
  assert.deepEqual(failures, []);
});
