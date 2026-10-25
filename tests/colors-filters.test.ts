import test from 'node:test';
import assert from 'node:assert/strict';
import {colorMaps,nextCategoryColor,defaultCategoryColor} from '../lib/colors.ts';
import {recordColors} from '../lib/card-options.ts';
import {applyFilters,activeFilters,accountActivity,categoryAmount,type Account,type Transaction} from '../lib/finance.ts';
const cats=(...rows:[string,string?][])=>rows.map(([name,color],i)=>({id:'c'+i,name,color}));
test('A chosen category or account colour is used everywhere, and a change shows up at once',()=>{
 const before=colorMaps(cats(['Food','#ac6747'],['Travel','#345c89']),[{id:'bank',color:'#70528b'}]);
 assert.equal(before.category('Food'),'#ac6747');assert.equal(before.category(' food '),'#ac6747','names match like the rest of the app');
 assert.equal(before.account('bank'),'#70528b');
 const after=colorMaps(cats(['Food','#2a7a7a'],['Travel','#345c89']),[{id:'bank',color:'#b08a2e'}]);
 assert.equal(after.category('Food'),'#2a7a7a');assert.equal(after.account('bank'),'#b08a2e');
 assert.equal(after.category('Travel'),before.category('Travel'),'other records keep their colour');
});
test('Old default-green categories and uncoloured accounts get distinct, stable palette colours',()=>{
 const list=cats(...['Food','Shopping','Transport','Home','Fun','Health','Travel','Salary'].map(n=>[n,defaultCategoryColor] as [string,string]));
 const a=colorMaps(list),b=colorMaps([...list].reverse());
 const colours=list.map(c=>a.category(c.name));
 assert.equal(new Set(colours).size,list.length,'no two categories share a colour');
 assert.ok(colours.every(c=>(recordColors as readonly string[]).includes(c)));
 assert.deepEqual(list.map(c=>b.category(c.name)),colours,'order of loading does not matter');
 const withNew=colorMaps([...list,{id:'zz',name:'Gifts',color:'#444b55'}]),moved=list.filter(c=>withNew.category(c.name)!==a.category(c.name));
 assert.ok(moved.length<=1&&moved.every(c=>a.category(c.name)==='#444b55'),'adding a coloured category only moves one that had that colour');
 assert.ok(!list.some(c=>withNew.category(c.name)==='#444b55'),'a chosen colour is not reused');
 const accounts=colorMaps([],[{id:'a1'},{id:'a2'},{id:'a3'}]);
 assert.equal(new Set(['a1','a2','a3'].map(accounts.account)).size,3);
 const mixed=colorMaps([],[{id:'card',color:'#8c4563'},{id:'cash'}]);assert.notEqual(mixed.account('cash'),'#8c4563','an uncoloured account avoids a colour picked for another');
 assert.equal(accounts.category('Deleted category'),colorMaps().category('Deleted category'),'a removed category keeps a stable colour on old records');
});
test('New categories start with a colour nobody uses yet',()=>{
 assert.equal(nextCategoryColor([]),recordColors[0]);
 assert.equal(nextCategoryColor([{color:recordColors[0]},{color:recordColors[1]}]),recordColors[2]);
});
const accounts:Account[]=[{id:'bank',name:'Bank',type:'Bank account',currency:'INR',opening:100000},{id:'cash',name:'Cash',type:'Cash',currency:'INR',opening:5000}];
const t=(id:string,extra:Partial<Transaction>):Transaction=>({id,name:id,type:'expense',amount:1000,account:'bank',category:'Food',date:'2026-10-20',...extra});
const ts=[t('food',{}),t('cash',{account:'cash',category:'Travel'}),t('lend',{partyId:'arjun',debtAction:'lend'}),t('trip',{sharedGroupId:'goa',paidBy:'Me',participants:['Me']}),t('net',{recurringId:'internet',category:'Bills'}),t('move',{type:'transfer',to:'cash',category:'Other',amount:500}),t('split',{category:'Food',splits:[{category:'Food',amount:300},{category:'Fun',amount:700}]})];
const ids=(list:Transaction[])=>list.map(x=>x.id);
test('Every filter narrows the list, and combined filters must all match',()=>{
 assert.deepEqual(ids(applyFilters(ts,{account:'cash'})),['cash','move'],'transfers show on both accounts');
 assert.deepEqual(ids(applyFilters(ts,{party:'arjun'})),['lend']);
 assert.deepEqual(ids(applyFilters(ts,{category:'Fun'})),['split'],'a split counts for each of its categories');
 assert.deepEqual(ids(applyFilters(ts,{shared:'any'})),['trip']);assert.deepEqual(ids(applyFilters(ts,{shared:'other'})),[]);
 assert.deepEqual(ids(applyFilters(ts,{recurring:'internet'})),['net']);
 assert.deepEqual(ids(applyFilters(ts,{account:'bank',category:'Food'})),['food','lend','trip','split']);
 assert.deepEqual(ids(applyFilters(ts,{account:'bank',category:'Food',shared:'any'})),['trip']);
 assert.equal(applyFilters(ts,{}).length,ts.length);
 assert.deepEqual(activeFilters({account:'bank',party:undefined,category:'Food'}),['account','category']);
});
test('Account activity and category amounts add up for the diagram and reports',()=>{
 const act=accountActivity(accounts,ts);
 assert.deepEqual(act.map(a=>[a.id,a.income,a.expense]),[['bank',0,5500],['cash',500,1000]]);
 assert.equal(categoryAmount(ts[6],'Food'),300);assert.equal(categoryAmount(ts[6],'Fun'),700);assert.equal(categoryAmount(ts[0],'Fun'),0);
});
