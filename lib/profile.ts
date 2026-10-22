import {z} from 'zod';
export const profileColors=['#2d6048','#345c89','#70528b','#ac6747','#444b55','#8c4563'] as const;
export const profileEmojis=['','🌿','🌻','🏡','✈️','🌙','💼','🌊','🐱'] as const;
export {countryCurrencies} from './countries.ts';
import {countries,currencies} from './countries.ts';
export const profileDetailsSchema=z.object({name:z.string().trim().min(1).max(60),bio:z.string().trim().max(160).optional(),avatar:z.string().max(60000).refine(s=>s===''||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s),'Choose a JPEG, PNG or WebP profile photo.').optional(),emoji:z.enum(profileEmojis).optional(),color:z.enum(profileColors).optional(),country:z.enum(countries),currency:z.enum(currencies).optional()});
