// Where the Android shortcuts, widgets and quick actions can send someone. They arrive as /?open=<target>
// (or, when the app is already showing, as a native event), and nothing else is accepted from a link.
export const openTargets=['add-transaction','calendar','switch-profile'] as const;
export type OpenTarget=typeof openTargets[number];
export const readOpenTarget=(search:string):OpenTarget|null=>{const v=new URLSearchParams(search).get('open');return (openTargets as readonly string[]).includes(v||'')?v as OpenTarget:null};
// A destination that needs something first says where to go instead. Everything waits until the person
// is signed in and has picked a profile, so a link never skips either.
export function openDecision(target:OpenTarget,state:{ready:boolean;accounts:number;profiles:number}):'wait'|'open'|'needs-account'|'only-one-profile'{
 if(!state.ready)return 'wait';
 if(target==='add-transaction'&&!state.accounts)return 'needs-account';
 return 'open';
}
// What the home screen widgets may show, kept small: a count per day for the months around today and the
// active profile's name and colour. No amounts, account names or descriptions ever leave the app for a widget.
export function widgetState(input:{signedIn:boolean;profile?:{name:string;color?:string};transactions:{date:string}[];today:string}){
 if(!input.signedIn||!input.profile)return {signedIn:false};
 const d=new Date(input.today+'T00:00:00Z'),edge=(n:number)=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1)).toISOString().slice(0,7);
 const from=edge(-1),to=edge(1),days:Record<string,number>={};
 for(const t of input.transactions){const m=t.date.slice(0,7);if(m>=from&&m<=to)days[t.date]=(days[t.date]||0)+1}
 return {signedIn:true,profile:input.profile.name,color:input.profile.color||'',days};
}
