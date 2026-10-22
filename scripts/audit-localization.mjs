import fs from 'node:fs';
import ts from 'typescript';
const catalog=JSON.parse(fs.readFileSync('lib/messages/en.json','utf8'));
const exemptions=new Set(['your.name','TWMG','THE WAY MONEY GOES','TWMG — The Way Money Goes','The Way Money Goes · പണം പോകുന്ന വഴി','English · हिन्दी · العربية · മലയാളം · Deutsch','Visa','Mastercard','American Express','RuPay','DELETE ACCOUNT','DELETE PROFILE']);
const missing=new Set();
for(const file of fs.readdirSync('app/ui').filter(name=>name.endsWith('.tsx'))){
 const source=ts.createSourceFile(file,fs.readFileSync('app/ui/'+file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function check(text){text=text.replace(/\s+/g,' ').trim();if(/[A-Za-z]/.test(text)&&!exemptions.has(text)&&!catalog[text]&&!/^TWMG/.test(text))missing.add(text)}
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(source)==='tr'&&node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0]))check(node.arguments[0].text);if(ts.isJsxText(node))check(node.text);ts.forEachChild(node,visit)}visit(source);
}
if(missing.size){console.error('Missing interface messages:',[...missing]);process.exitCode=1}else console.log('All static interface labels have catalog entries.');
