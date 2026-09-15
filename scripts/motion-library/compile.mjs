import ts from 'typescript';
// Generated modules are compiled as data. They are never evaluated in Node or the application page.
const imports = {'@motion': new Set(['Asset']), react: new Set(['default', 'Fragment']), remotion: new Set(['interpolate', 'spring', 'Easing', 'random'])};
const forbidden = new Set(['window','document','globalThis','self','parent','top','frames','opener','location','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','importScripts','eval','Function','require','process','module','exports','__dirname','__filename','constructor','prototype','__proto__','Reflect','Proxy','Object','Symbol','setTimeout','setInterval','requestAnimationFrame','localStorage','sessionStorage','indexedDB','caches']);
const tags = new Set(['Asset','div','span','p','strong','b','i','em','small','img','video','svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','defs','linearGradient','radialGradient','stop','clipPath','mask','pattern','filter','feGaussianBlur','feDropShadow']);
export function compileEffect(source) {
  if (typeof source !== 'string' || source.length > 40000) throw new Error('动效代码过长');
  const ast = ts.createSourceFile('Effect.tsx', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  if (ast.parseDiagnostics.length) throw new Error(ts.flattenDiagnosticMessageText(ast.parseDiagnostics[0].messageText, '\n'));
  let hasDefault = false;
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const name = node.moduleSpecifier.text, allowed = imports[name];
      if (!allowed || !node.importClause || node.importClause.namedBindings && !ts.isNamedImports(node.importClause.namedBindings)) throw new Error('仅支持 React 与指定的 Remotion 动画函数');
      for (const el of node.importClause.namedBindings?.elements || []) if (!allowed.has((el.propertyName || el.name).text)) throw new Error('不支持此动画依赖');
      if (node.importClause.name && name !== 'react') throw new Error('Remotion 请使用具名导入');
    }
    if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) hasDefault = true;
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node) || ts.isImportEqualsDeclaration(node) || ts.isNewExpression(node) || ts.isClassDeclaration(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isAwaitExpression(node) || node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.ImportKeyword) throw new Error('动效只支持按帧计算的 React 函数组件');
    // CSS top is a position value; a bare top identifier is the parent window.
    const cssTop = ts.isIdentifier(node) && node.text === 'top' && ts.isPropertyAssignment(node.parent) && node.parent.name === node;
    if (ts.isIdentifier(node) && forbidden.has(node.text) && !cssTop) throw new Error(`动效不能访问 ${node.text}`);
    if (ts.isElementAccessExpression(node) && !ts.isNumericLiteral(node.argumentExpression)) throw new Error('仅支持数字索引访问数组');
    if (ts.isPropertyAccessExpression(node) && ['call','apply','bind','getPrototypeOf','setPrototypeOf'].includes(node.name.text)) throw new Error('不支持动态执行代码');
    if (ts.isStringLiteralLike(node) && /(?:https?:|data:|javascript:|file:|blob:|@import|url\s*\()/i.test(node.text)) throw new Error('图片和视频请使用 assets 中提供的素材');
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (!tags.has(node.tagName.getText(ast))) throw new Error('请使用支持的 HTML/SVG 画面元素');
    }
    if (ts.isJsxAttribute(node) && (/^on/i.test(node.name.getText(ast)) || ['dangerouslySetInnerHTML','ref','srcDoc','href','xlinkHref'].includes(node.name.getText(ast)))) throw new Error('动效不支持页面交互或跳转');
    if (ts.isJsxSpreadAttribute(node)) throw new Error('请显式填写画面属性');
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!hasDefault) throw new Error('请 default export 一个函数组件');
  return ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true}}).outputText;
}
