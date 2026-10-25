export const cardColors=['#2d6048','#345c89','#70528b','#ac6747','#444b55','#8c4563'] as const;
export const cardTypes=['Visa','Mastercard','RuPay','American Express','Discover','Other'] as const;
// One palette and icon set for everything that can be personalised: accounts,
// parties, groups, plans, categories, payment methods and profiles. Presets are
// suggestions — any #rrggbb color is accepted. '' means "use the default icon".
export const recordColors=[...cardColors,'#2a7a7a','#b08a2e','#5b6f2e','#a14a3b'] as const;
export const recordColorNames:Record<string,string>={'#2d6048':'Emerald','#345c89':'Ocean','#70528b':'Plum','#ac6747':'Terracotta','#444b55':'Slate','#8c4563':'Rose','#2a7a7a':'Teal','#b08a2e':'Mustard','#5b6f2e':'Olive','#a14a3b':'Brick'};
export const recordEmojis=['','🏦','💳','💵','👛','🐷','🏠','🚗','✈️','🛒','🍽️','☕','🎓','🏥','💪','💡','📱','🎮','🎁','👥','🤝','🎯','🌱','🌿','🌻','🏡','🌙','💼','🌊','🐱'] as const;
export const hexColor=/^#[0-9a-fA-F]{6}$/;
// Text/icon color that stays readable on a chosen background color.
export function readableOn(hex:string){const n=parseInt(hex.slice(1),16),r=n>>16&255,g=n>>8&255,b=n&255;return (r*299+g*587+b*114)/1000>160?'#1d2b22':'#ffffff'}
