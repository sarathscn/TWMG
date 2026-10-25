import test from 'node:test';
import assert from 'node:assert/strict';
import {groupSelf,removedMembers,withoutMembers,partySyncPlan,splitSharedExpense,sharedMemberBalances,type Item,type Party,type SharedExpense} from '../lib/finance.ts';
import {sharedSchema,partySchema} from '../lib/record-schemas.ts';
import {recordEmojis,emojiCatalog} from '../lib/card-options.ts';
const group=(names:string[],extra:Partial<Item>={}):Item=>({id:'g1',name:'Trip',amount:0,memberNames:names,members:names.length,...extra});
const entry=(id:string,paidBy:string,amount:number,participants?:string[]):SharedExpense=>({id,name:'E'+id,amount,date:'2026-10-25',paidBy,participants});
let n=0;const ids=()=>'p'+(++n);
test('The signed-in user is the saved self member, or a member named after them or "Me"',()=>{
 assert.equal(groupSelf(group(['Sarath','Arjun'],{self:'Sarath'})),'Sarath');
 assert.equal(groupSelf(group(['sarath','Arjun']),'Sarath'),'sarath');
 assert.equal(groupSelf(group(['Me','Arjun'])),'Me');
 assert.equal(groupSelf(group(['Arjun','Meera'])),undefined);
 assert.equal(groupSelf(group(['Arjun','Meera'],{self:'Gone'})),undefined,'a self that is no longer a member is ignored');
});
test('Removing a member drops them from splits and the remaining people share the amount exactly',()=>{
 assert.deepEqual(removedMembers(['Sarath','Arjun','Meera'],['sarath','Arjun']),['Meera']);
 const before=[entry('1','Sarath',1000,['Sarath','Arjun','Meera']),entry('2','Arjun',301)];
 const after=withoutMembers(before,['Meera']);
 assert.deepEqual(after[0].participants,['Sarath','Arjun']);assert.equal(after[1],before[1],'untouched entries are kept as they are');
 assert.deepEqual(splitSharedExpense(after[0],['Sarath','Arjun']).map(s=>s.amount),[500,500]);
 const balances=sharedMemberBalances(group(['Sarath','Arjun'],{amount:1301,expenses:after}));
 assert.equal(balances.reduce((s,b)=>s+b.share,0),1301,'shares always add up to the total');
 assert.equal(balances.reduce((s,b)=>s+b.net,0),0);
});
test('A member who paid, or the last person in a split, cannot be removed silently',()=>{
 assert.throws(()=>withoutMembers([entry('1','Meera',500,['Sarath','Meera'])],['Meera']),/paid for/);
 assert.throws(()=>withoutMembers([entry('1','Sarath',500,['Meera'])],['Meera']),/nobody left/);
});
test('Group members become debt parties without duplicates, and leave cleanly',()=>{
 const parties:Party[]=[{id:'arjun',name:'arjun'}];
 const g=group(['Sarath','Arjun','Meera'],{self:'Sarath'});
 const add=partySyncPlan(parties,[],undefined,g,ids);
 assert.deepEqual(add.deletes,[]);
 assert.deepEqual(add.upserts.map(p=>[p.name,p.sharedGroupIds,!!p.autoCreated]),[['arjun',['g1'],false],['Meera',['g1'],true]],'existing party reused, self skipped');
 // Saving the same group again changes nothing.
 assert.deepEqual(partySyncPlan(add.upserts,[],g,g,ids),{upserts:[],deletes:[]});
 // Meera leaves: the party the group created is removed; Arjun leaves too but keeps his own party.
 const smaller=group(['Sarath','Zoya'],{self:'Sarath'});
 const leave=partySyncPlan(add.upserts,[],g,smaller,ids);
 assert.deepEqual(leave.deletes.map(p=>p.name),['Meera']);
 assert.deepEqual(leave.upserts.map(p=>[p.name,p.sharedGroupIds]),[['arjun',[]],['Zoya',['g1']]]);
 // A created party with its own transactions is kept, only unlinked.
 const kept=partySyncPlan(add.upserts,[{partyId:add.upserts[1].id}],g,smaller,ids);
 assert.ok(!kept.deletes.length);assert.ok(kept.upserts.some(p=>p.name==='Meera'&&!p.sharedGroupIds?.length));
 // Deleting the group unlinks everyone.
 const gone=partySyncPlan(add.upserts,[],g,undefined,ids);
 assert.deepEqual(gone.deletes.map(p=>p.name),['Meera']);assert.deepEqual(gone.upserts.map(p=>p.sharedGroupIds),[[]]);
 // A party in two groups stays until it leaves both.
 const twice:Party[]=[{id:'m',name:'Meera',autoCreated:true,sharedGroupIds:['g1','g2']}];
 const one=partySyncPlan(twice,[],g,undefined,ids);
 assert.ok(!one.deletes.length);assert.deepEqual(one.upserts[0].sharedGroupIds,['g2']);
});
test('Schemas accept the self member and party links, and reject a self outside the group',()=>{
 assert.equal(sharedSchema.parse({id:'g',name:'T',amount:0,memberNames:['Sarath','Arjun'],members:2,self:'Sarath'}).self,'Sarath');
 assert.throws(()=>sharedSchema.parse({id:'g',name:'T',amount:0,memberNames:['Sarath','Arjun'],members:2,self:'Meera'}),/member of this group/);
 assert.deepEqual(partySchema.parse({id:'p',name:'Arjun',sharedGroupIds:['g'],autoCreated:true}).sharedGroupIds,['g']);
});
test('The emoji picker offers unique, categorised icons and keeps every earlier icon valid',()=>{
 const earlier=['🏦','💳','💵','👛','🐷','🏠','🚗','✈️','🛒','🍽️','☕','🎓','🏥','💪','💡','📱','🎮','🎁','👥','🤝','🎯','🌱','🌿','🌻','🏡','🌙','💼','🌊','🐱'];
 assert.ok(earlier.every(e=>recordEmojis.includes(e)));
 assert.equal(new Set(recordEmojis).size,recordEmojis.length);
 assert.ok(emojiCatalog.every(c=>c.emojis.length&&c.emojis.every(([,words])=>words.length>0)));
 assert.equal(partySchema.parse({id:'p',name:'A',emoji:'🧾'}).emoji,'🧾');
 assert.throws(()=>partySchema.parse({id:'p',name:'A',emoji:'not-an-emoji'}));
});
