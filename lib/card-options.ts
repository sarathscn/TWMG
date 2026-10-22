export const cardColors=['#2d6048','#345c89','#70528b','#ac6747','#444b55','#8c4563'] as const;
export const cardTypes=['Visa','Mastercard','RuPay','American Express','Discover','Other'] as const;
// Reference colors and emoji for accounts, parties, groups and plans. The first
// six match cardColors so existing card colors stay valid. '' means "use the default icon".
export const recordColors=[...cardColors,'#2a7a7a','#b08a2e','#5b6f2e','#a14a3b'] as const;
export const recordColorNames:Record<string,string>={'#2d6048':'Emerald','#345c89':'Ocean','#70528b':'Plum','#ac6747':'Terracotta','#444b55':'Slate','#8c4563':'Rose','#2a7a7a':'Teal','#b08a2e':'Mustard','#5b6f2e':'Olive','#a14a3b':'Brick'};
export const recordEmojis=['','🏦','💳','💵','👛','🐷','🏠','🚗','✈️','🛒','🍽️','🎓','🏥','💡','📱','🎁','👥','🤝','🎯','🌱'] as const;
