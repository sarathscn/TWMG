import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMoney,currencyScale,fractionDigits,countryCurrencies} from '../lib/countries.ts';
import {categorySchema,paymentMethodSchema,defaultMethods} from '../lib/preferences.ts';
import {accountSchema} from '../lib/record-schemas.ts';
import {profileDetailsSchema} from '../lib/profile.ts';
test('BHD keeps three exact minor-unit digits; INR keeps two without changing existing amounts',()=>{assert.equal(parseMoney('1.005','BHD'),1005);assert.equal(parseMoney('-0.001','BHD'),-1);assert.equal(parseMoney('0.29','INR'),29);assert.throws(()=>parseMoney('1.005','INR'));assert.throws(()=>parseMoney('1.0001','BHD'));assert.equal(currencyScale('BHD'),1000);assert.equal(fractionDigits('INR'),2);assert.equal(countryCurrencies.Bahrain,'BHD')});
test('Bahrain profiles and digital wallet accounts validate while legacy Wallet stays valid',()=>{assert.equal(profileDetailsSchema.parse({name:'Home',country:'Bahrain'}).country,'Bahrain');for(const type of ['Wallet','Digital Wallet'])assert.equal(accountSchema.parse({id:'a',name:'Wallet',type,country:'Bahrain',currency:'BHD',opening:1005}).opening,1005)});
test('Country methods and custom validation',()=>{assert.ok(defaultMethods('India').some(x=>x.name==='PhonePe / UPI'));assert.ok(defaultMethods('Bahrain').some(x=>x.name==='BenefitPay'));assert.ok(!defaultMethods('Bahrain').some(x=>x.name.includes('PhonePe')));assert.equal(paymentMethodSchema.parse({id:'x',name:'Local wallet',country:'Bahrain',enabled:false}).enabled,false);assert.throws(()=>paymentMethodSchema.parse({id:'x',name:'',country:'Bahrain'}));assert.throws(()=>categorySchema.parse({id:'x',name:' ',color:'#ffffff'}));assert.equal(categorySchema.parse({id:'x',name:' Education '}).name,'Education')});
