import {z} from 'zod';
import {countries} from './countries.ts';
export const categorySchema=z.object({id:z.string().min(1).max(120),name:z.string().trim().min(1).max(80),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2d634a')});
export const paymentMethodSchema=z.object({id:z.string().min(1).max(120),name:z.string().trim().min(1).max(80),country:z.enum(countries),enabled:z.boolean().default(true),custom:z.boolean().default(true),source:z.string().url().optional()});
export type Category=z.infer<typeof categorySchema>;
export type PaymentMethod=z.infer<typeof paymentMethodSchema>;
export const paymentPresets:Record<string,{name:string;source?:string}[]>={India:[{name:'Google Pay / UPI',source:'https://pay.google.com/intl/en_in/about/'},{name:'Paytm / UPI',source:'https://paytm.com/upi'},{name:'PhonePe / UPI',source:'https://www.phonepe.com/'},{name:'UPI'},{name:'Cash'},{name:'Debit card'},{name:'Credit card'},{name:'Bank transfer'}],Bahrain:[{name:'BenefitPay',source:'https://benefit.bh/Personal/benefitpay/'},{name:'stc pay',source:'https://www.stc.com.bh/content/stcpay'},{name:'BPay',source:'https://www.afs.com.bh/en/solutions/consumers/bpay'},{name:'Beyon Money',source:'https://www.beyonmoney.com/'},{name:'Cash'},{name:'Debit card'},{name:'Credit card'},{name:'Bank transfer'}]};
export function defaultMethods(country:string){return paymentPresets[country]||[{name:'Cash'},{name:'Debit card'},{name:'Credit card'},{name:'Bank transfer'}]}
