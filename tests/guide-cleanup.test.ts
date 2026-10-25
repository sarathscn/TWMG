import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const ui=Object.fromEntries(readdirSync('app/ui').filter(f=>f.endsWith('.tsx')).map(f=>[f,readFileSync('app/ui/'+f,'utf8')]));
test('No edit or delete icons are used anywhere in the interface',()=>{
 for(const [file,src] of Object.entries(ui)){
  assert.ok(!/<(Pencil|PencilLine|SquarePen|Edit|Edit2|Edit3|Trash|Trash2|Eraser)\b/.test(src),file+' renders an edit/delete icon');
  const lucide=src.match(/import \{([^}]*)\} from 'lucide-react'/)?.[1]||'';
  assert.ok(!/\b(Pencil|PencilLine|SquarePen|Edit|Edit2|Edit3|Trash|Trash2|Eraser)\b/.test(lucide),file+' imports an edit/delete icon');
 }
});
test('Records stay editable and deletable without icons, and deletes still ask first',()=>{
 const app=ui['FinanceApp.tsx'];
 assert.match(app,/className="tx-row"[^>]*onClick=\{\(\) => setModal\(\{ kind: 'transactions', value: x \}\)\}/,'a transaction row opens its editor');
 assert.match(app,/confirmAction\('Delete this record\? This cannot be undone\.'\)\)\s*save\(kind, value, 'delete'\)/,'the editor delete asks first');
 assert.match(ui['Preferences.tsx'],/async function remove[\s\S]*?confirmAction/,'category delete asks first');
 assert.match(ui['Swipeable.tsx'],/onEdit\?\.\(\)/);
});
test('Settings has the Reports and App guide tiles, and every tour step points at a real element',()=>{
 const app=ui['FinanceApp.tsx'];
 assert.match(app,/\['Reports', ChartNoAxesCombined,[^\]]*'reports-tile'\]/);
 assert.match(app,/\['App guide', Compass,[^\]]*'guide-tile'\]/);
 assert.match(app,/name === 'App guide' \? openGuide\(0\)/,'App guide restarts the tour from step 1');
 const tour=app.slice(app.indexOf('const tourSteps'),app.indexOf('function openGuide'));
 const anchors=[...tour.matchAll(/\[data-tour=([a-z-]+)\]/g)].map(m=>m[1]);
 assert.ok(anchors.length>=6);
 for(const a of anchors)assert.ok(app.includes(`data-tour="${a}"`)||app.includes(`'${a}'`),'missing anchor '+a);
 for(const cls of ['bottom-nav','nav-add-transaction','page-transaction-add','modal-backdrop','tx-table'])assert.ok(app.includes(cls),'missing '+cls);
 assert.ok(!/Pencil|pencil icon|trash/i.test(tour),'the tour never mentions removed icons');
});
test('Guide progress is saved per account, restored, and never breaks without storage',async()=>{
 const store=new Map<string,string>();
 (globalThis as any).localStorage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v)}};
 const {loadGuide,saveGuide}=await import('../app/ui/Onboarding.tsx');
 assert.equal(loadGuide('a@b.com'),null,'first visit has no saved state');
 saveGuide('A@B.com',{status:'active',step:4});
 assert.deepEqual(loadGuide('a@b.com'),{status:'active',step:4},'keys ignore email case');
 assert.equal(loadGuide('other@b.com'),null,'each account keeps its own progress');
 saveGuide('a@b.com',{status:'done',step:0});assert.equal(loadGuide('a@b.com')?.status,'done');
 store.set('twmg-guide:guest','not json');assert.equal(loadGuide(''),null,'corrupt data is ignored');
 (globalThis as any).localStorage={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}};
 assert.equal(loadGuide('a@b.com'),null);assert.doesNotThrow(()=>saveGuide('a@b.com',{status:'done',step:0}));
});
test('Notifications list every open reminder, open their records, and clear by swipe until the next due date',()=>{
 const app=ui['FinanceApp.tsx'];
 assert.match(app,/reminders\(data, currency, localToday\)/,'the bell uses the shared reminders list');
 assert.match(app,/noteKey = \(x: Reminder\) => x\.id \+ '@' \+ x\.due/,'clearing is tied to one due date, so the next cycle shows again');
 const item=app.slice(app.indexOf('<Swipeable key={noteKey(x)}'),app.indexOf('</Swipeable>)}</div>{text(!notes.length'));
 assert.ok(item.length>0,'notification rows are swipeable');
 for(const part of ['deleteLabel="Clear"','onClick={() => openNote(x)}','onDelete={() => keepCleared([...cleared, noteKey(x)])}'])assert.ok(item.includes(part),'missing '+part);
 assert.match(app,/\{ recurring: 'recurring', card: 'accounts', shared: 'shared' \}/,'bills, cards and groups open their own transactions');
 assert.ok(!/data\.recurring\.map\(x => <div key=\{x\.id\}><span>\{x\.name\}<small>/.test(app),'the old bills-only list is gone');
});
