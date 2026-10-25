import {z} from 'zod';
import {currencies,countries} from './countries.ts';
import {cardTypes,hexColor,recordEmojis} from './card-options.ts';
export const moneySchema=z.number().int().safe().nonnegative().max(1e12);
const label=z.string().trim().min(1).max(120);
export const appearance={color:z.string().regex(hexColor,'Choose a valid color.').transform(c=>c.toLowerCase()).optional(),emoji:z.enum(recordEmojis).optional()};
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const dueDate=z.string().refine(s=>s===''||validDate(s),'Choose a valid due date.');
export const partySchema=z.object({id:label,name:label,notes:z.string().max(1000).optional(),...appearance});
// Bank accounts keep only the bank name and last four digits; wallets keep the provider name and a
// short reference (last digits or wallet ID). Full account or card numbers are never accepted.
export const bankTypes=['Bank account','Savings'] as const,walletTypes=['Wallet','Digital Wallet'] as const;
const institution=z.string().trim().min(1).max(60);
const walletReference=z.string().trim().regex(/^[A-Za-z0-9@._-]{2,30}$/,'Use 2–30 letters, digits or @ . _ -').refine(s=>!/\d{7,}/.test(s),'Enter only the last few digits, never the full number.');
export const accountSchema=z.object({id:label,name:label,type:z.enum(['Bank account','Savings','Cash','Wallet','Digital Wallet','Credit card']),country:z.enum(countries).optional(),currency:z.enum(currencies),opening:z.number().int().safe().min(-1e12).max(1e12),limit:moneySchema.optional(),due:dueDate.optional(),cardType:z.enum(cardTypes).optional(),lastFour:z.string().regex(/^\d{4}$/, 'Enter exactly four digits.').optional(),institution:institution.optional(),reference:walletReference.optional(),...appearance}).superRefine((a,ctx)=>{if(a.type==='Credit card'&&(!a.limit||a.limit<=0))ctx.addIssue({code:'custom',message:'Enter a positive credit limit.',path:['limit']})}).transform(a=>{
 if(a.type==='Credit card'){const {reference,...card}=a;return card}
 const base={id:a.id,name:a.name,type:a.type,country:a.country,currency:a.currency,opening:a.opening,...(a.color?{color:a.color}:{}),...(a.emoji?{emoji:a.emoji}:{})};
 if((bankTypes as readonly string[]).includes(a.type))return {...base,...(a.institution?{institution:a.institution}:{}),...(a.lastFour?{lastFour:a.lastFour}:{})};
 if((walletTypes as readonly string[]).includes(a.type))return {...base,...(a.institution?{institution:a.institution}:{}),...(a.reference?{reference:a.reference}:{})};
 return base;
});
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
