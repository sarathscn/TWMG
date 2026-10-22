export const countries=['India','Bahrain','Saudi Arabia','United States','Germany','United Arab Emirates','United Kingdom'] as const;
export const countryCurrencies:Record<string,string>={India:'INR',Bahrain:'BHD','Saudi Arabia':'SAR','United States':'USD',Germany:'EUR','United Arab Emirates':'AED','United Kingdom':'GBP'};
export const currencies=['INR','BHD','SAR','USD','EUR','AED','GBP'] as const;
export const fractionDigits=(currency:string)=>currency==='BHD'?3:2;
export const currencyScale=(currency:string)=>10**fractionDigits(currency);
// Largest amount accepted in any form, in whole currency units. Keeps figures
// readable on cards and well inside the server's 1e12 minor-unit bound.
export const maxAmountMajor=999_999_999;
export function parseMoney(value:string,currency:string){const digits=fractionDigits(currency);if(!new RegExp('^-?\\d+(\\.\\d{1,'+digits+'})?$').test(value))throw Error(`Use at most ${digits} decimal places for ${currency}.`);const negative=value.startsWith('-'),[whole,fraction='']=value.replace('-','').split('.');if(Number(whole)>maxAmountMajor)throw Error('Amounts can be up to 999,999,999.');const n=Number(whole)*currencyScale(currency)+Number(fraction.padEnd(digits,'0'));if(!Number.isSafeInteger(n))throw Error('Amount is too large.');return negative?-n:n}

export const countryForCurrency=(currency:string,fallback='India')=>Object.keys(countryCurrencies).find(country=>countryCurrencies[country]===currency)||fallback;
