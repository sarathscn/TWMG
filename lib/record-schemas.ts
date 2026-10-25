import {z} from 'zod';
import {currencies,countries} from './countries.ts';
import {cardTypes,hexColor,recordEmojis} from './card-options.ts';
export const moneySchema=z.number().int().safe().nonnegative().max(1e12);
const label=z.string().trim().min(1).max(120);
export const appearance={color:z.string().regex(hexColor,'Choose a valid color.').transform(c=>c.toLowerCase()).optional(),emoji:z.enum(recordEmojis).optional()};
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const dueDate=z.string().refine(s=>s===''||validDate(s),'Choose a valid due date.');
export const partySchema=z.object({id:label,name:label,notes:z.string().max(1000).optional(),...appearance});
export const accountSchema=z.object({id:label,name:label,type:z.enum(['Bank account','Savings','Cash','Wallet','Digital Wallet','Credit card']),country:z.enum(countries).optional(),currency:z.enum(currencies),opening:z.number().int().safe().min(-1e12).max(1e12),limit:moneySchema.optional(),due:dueDate.optional(),cardType:z.enum(cardTypes).optional(),lastFour:z.string().regex(/^\d{4}$/, 'Enter exactly four digits.').optional(),...appearance}).superRefine((a,ctx)=>{if(a.type==='Credit card'&&(!a.limit||a.limit<=0))ctx.addIssue({code:'custom',message:'Enter a positive credit limit.',path:['limit']})}).transform(a=>a.type==='Credit card'?a:{id:a.id,name:a.name,type:a.type,country:a.country,currency:a.currency,opening:a.opening,color:a.color,emoji:a.emoji});
export const itemSchema=z.object({id:label,name:label,amount:moneySchema,target:moneySchema.positive().optional(),category:z.string().max(120).optional(),due:dueDate.optional(),type:z.string().max(40).optional(),paid:moneySchema.optional(),party:z.string().max(200).optional(),members:z.number().int().min(2).max(100).optional(),status:z.string().max(30).optional(),...appearance});
const date=z.string().refine(validDate,'Choose a valid date.');
export const sharedSchema=itemSchema.extend({memberNames:z.array(z.string().trim().min(1).max(80)).min(2).max(100).optional(),expenses:z.array(z.object({id:label,name:label,amount:moneySchema.positive(),date,paidBy:z.string().trim().max(120),notes:z.string().max(1000).optional(),participants:z.array(label).min(1).max(100).optional(),transactionId:label.optional()})).max(100).optional()}).superRefine((g,ctx)=>{
 if(g.expenses){const total=g.expenses.reduce((s,x)=>s+x.amount,0);if(!Number.isSafeInteger(total)||total>1e13||total!==g.amount)ctx.addIssue({code:'custom',message:'Group total must equal the sum of its transactions.',path:['amount']});if(new Set(g.expenses.map(x=>x.id)).size!==g.expenses.length)ctx.addIssue({code:'custom',message:'Each group transaction needs a unique identifier.'});}
 if((g.paid||0)>g.amount)ctx.addIssue({code:'custom',message:'Settled amount cannot exceed the group total.',path:['paid']});
 if(g.memberNames){
  if(new Set(g.memberNames.map(n=>n.toLowerCase())).size!==g.memberNames.length)ctx.addIssue({code:'custom',message:'Member names must be unique.'});
  if(g.members!==g.memberNames.length)ctx.addIssue({code:'custom',message:'Member count must match the names.'});
  for(const e of g.expenses||[]){if(e.paidBy&&!g.memberNames.includes(e.paidBy))ctx.addIssue({code:'custom',message:'The payer must belong to this group.'});if(e.participants&&(new Set(e.participants).size!==e.participants.length||e.participants.some(n=>!g.memberNames!.includes(n))))ctx.addIssue({code:'custom',message:'Choose unique split members from this group.'});}
 }
});
