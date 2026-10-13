import ts from "typescript";

/** Reject unsafe type annotations, not the legitimate string value "any". */
export function hasExplicitAny(source, filename = "component.tsx") {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = node => node.kind === ts.SyntaxKind.AnyKeyword || Boolean(ts.forEachChild(node, visit));
  return visit(tree);
}
