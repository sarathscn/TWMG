export const cardColors=['#2d6048','#345c89','#70528b','#ac6747','#444b55','#8c4563'] as const;
export const cardTypes=['Visa','Mastercard','RuPay','American Express','Discover','Other'] as const;
// One palette and icon set for everything that can be personalised: accounts,
// parties, groups, plans, categories, payment methods and profiles. Presets are
// suggestions — any #rrggbb color is accepted. '' means "use the default icon".
export const recordColors=[...cardColors,'#2a7a7a','#b08a2e','#5b6f2e','#a14a3b'] as const;
export const recordColorNames:Record<string,string>={'#2d6048':'Emerald','#345c89':'Ocean','#70528b':'Plum','#ac6747':'Terracotta','#444b55':'Slate','#8c4563':'Rose','#2a7a7a':'Teal','#b08a2e':'Mustard','#5b6f2e':'Olive','#a14a3b':'Brick'};
// Icons offered by the emoji picker, by category, each with search words. Every icon
// that was ever offered stays in the list so saved records remain valid.
export const emojiCatalog:readonly {category:string;emojis:readonly (readonly [string,string])[]}[]=[
 {category:'Money',emojis:[['🏦','bank'],['💳','card credit debit'],['💵','cash dollar note'],['💶','euro note'],['💷','pound note'],['💴','yen note'],['💰','money bag savings'],['🪙','coin'],['👛','purse wallet'],['👝','pouch wallet'],['🐷','piggy bank savings'],['💸','money spend'],['💹','chart growth investment'],['📈','chart up investment stocks'],['📉','chart down loss'],['🧾','receipt bill'],['💲','dollar price'],['🏧','atm'],['💎','gem jewellery'],['⚖️','balance scale loan']]},
 {category:'Home & bills',emojis:[['🏠','home house rent'],['🏡','house garden home'],['🏢','office building apartment'],['🛋️','sofa furniture'],['🛏️','bed'],['🚿','shower water'],['💡','electricity light bulb'],['🔌','plug power'],['🔥','gas fire heating'],['💧','water'],['📶','internet wifi signal'],['📺','tv cable'],['🧹','cleaning broom'],['🧺','laundry basket'],['🔧','repair maintenance'],['🔑','key rent deposit']]},
 {category:'Food & drink',emojis:[['🍽️','dining restaurant food'],['☕','coffee cafe'],['🍵','tea'],['🍕','pizza'],['🍔','burger fast food'],['🍜','noodles'],['🍛','curry rice'],['🍱','lunch box'],['🥗','salad healthy'],['🍰','cake dessert'],['🍦','ice cream'],['🍺','beer drinks bar'],['🍷','wine'],['🥤','soft drink juice'],['🍎','fruit groceries'],['🥦','vegetables groceries'],['🥛','milk dairy'],['🍞','bread bakery']]},
 {category:'Shopping',emojis:[['🛒','groceries cart supermarket'],['🛍️','shopping bags'],['👕','clothes shirt'],['👗','dress fashion'],['👟','shoes'],['👜','handbag'],['💄','beauty makeup'],['💍','ring jewellery'],['🎁','gift present'],['📦','parcel delivery order'],['🧸','toys kids'],['🪴','plant']]},
 {category:'Transport & travel',emojis:[['🚗','car'],['🚕','taxi cab'],['🛵','scooter bike'],['🚲','bicycle'],['🚌','bus'],['🚆','train metro'],['✈️','flight travel plane'],['⛽','fuel petrol gas'],['🅿️','parking'],['🚢','ship cruise'],['🏖️','beach holiday'],['🏨','hotel'],['🗺️','map trip'],['🧳','luggage travel'],['🕌','mosque'],['🛕','temple']]},
 {category:'Health & care',emojis:[['🏥','hospital health'],['💊','medicine pharmacy'],['🩺','doctor'],['🦷','dentist teeth'],['👓','glasses optician'],['💪','gym fitness'],['🧘','yoga wellness'],['🏃','running sport'],['💇','haircut salon'],['🧴','toiletries care'],['❤️','heart love'],['🩹','first aid']]},
 {category:'Work & study',emojis:[['💼','work job business'],['💻','laptop computer'],['📱','phone mobile'],['🖨️','printer office'],['📚','books study'],['🎓','education school college'],['✏️','stationery pencil'],['🏫','school'],['🧑‍💻','freelance developer'],['📝','notes tax forms'],['🛠️','tools'],['🏭','factory']]},
 {category:'Fun & hobbies',emojis:[['🎮','games gaming'],['🎬','movies cinema'],['🎵','music'],['🎧','headphones streaming'],['🎨','art hobby'],['📷','camera photo'],['⚽','football sport'],['🏏','cricket sport'],['🎾','tennis'],['🎉','party celebration'],['🎂','birthday'],['🎟️','tickets event'],['🎯','goal target'],['🎲','board games'],['📖','reading']]},
 {category:'People',emojis:[['👥','group people'],['🤝','deal partner handshake'],['👨‍👩‍👧','family'],['👶','baby child'],['🧒','kid'],['👵','grandparent elder'],['🧑‍🤝‍🧑','friends'],['💑','couple partner'],['🙋','me person'],['🐶','dog pet'],['🐱','cat pet'],['🐾','pets']]},
 {category:'Nature',emojis:[['🌱','seedling growth'],['🌿','herb leaf'],['🌻','sunflower'],['🌳','tree'],['🌸','flower blossom'],['🌙','moon night'],['☀️','sun'],['🌊','wave sea'],['⛰️','mountain'],['🌈','rainbow'],['❄️','snow winter'],['⭐','star']]},
 {category:'Symbols',emojis:[['✅','done check'],['📌','pin important'],['⏰','alarm reminder'],['📅','calendar date'],['🔔','bell notification'],['🔒','lock secure'],['⚠️','warning'],['💯','hundred'],['➕','plus add'],['🔁','repeat recurring'],['🏷️','tag label'],['🎗️','charity donation']]}
];
export const recordEmojis=['',...emojiCatalog.flatMap(c=>c.emojis.map(e=>e[0]))] as [string,...string[]];
export const hexColor=/^#[0-9a-fA-F]{6}$/;
// Text/icon color that stays readable on a chosen background color.
export function readableOn(hex:string){const n=parseInt(hex.slice(1),16),r=n>>16&255,g=n>>8&255,b=n&255;return (r*299+g*587+b*114)/1000>160?'#1d2b22':'#ffffff'}
