import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogs,translate,translateMessage} from '../lib/localization.ts';
test('Every language covers every interface message and preserves interpolation tokens',()=>{
 const keys=Object.keys(catalogs.en).sort();
 for(const locale of ['hi','ar','ml','de'] as const){assert.deepEqual(Object.keys(catalogs[locale]).sort(),keys,locale);for(const key of keys){assert.ok(catalogs[locale][key]?.trim(),`${locale}: ${key}`);assert.deepEqual((catalogs[locale][key].match(/\{\d+\}/g)||[]).sort(),(key.match(/\{\d+\}/g)||[]).sort(),`${locale}: ${key}`)}}
});
test('Navigation and validation use the selected language while user content stays intact',()=>{
 assert.equal(translate('de','Finance'),'Finanzen');assert.equal(translate('ar','Profile'),'الملف الشخصي');assert.equal(translate('hi','Lent'),'उधार दिया');
 assert.equal(translate('ml','Arjun'),'Arjun');assert.equal(translate('ar','INR'),'INR');assert.equal(translate('de','Edit {0}','Finance'),'Finance bearbeiten');
 assert.equal(translate('de','Edit Arjun'),'Arjun bearbeiten');assert.equal(translate('de','Use at least {0} characters.',8),'Verwende mindestens 8 Zeichen.');
 assert.notEqual(translateMessage('ml','An unrecognized internal server failure'),'An unrecognized internal server failure');assert.equal(translate('de','Unknown user note'),'Unknown user note');
});
