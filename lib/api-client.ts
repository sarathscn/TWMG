export class ApiError extends Error {
 status:number;
 constructor(message:string,status:number){super(message);this.status=status;this.name='ApiError'}
}
export async function readApiResponse<T=any>(response:Response):Promise<T>{
 const raw=await response.text();
 let value:any;
 try{value=JSON.parse(raw)}catch{
  if(response.status===401||response.status===403||response.redirected)throw new ApiError('Your session has expired. Sign in again, then retry. Your form is still here.',response.status);
  throw new ApiError(`The server could not complete this request${response.status?` (HTTP ${response.status})`:''}. Your form has been kept. Please retry.`,response.status);
 }
 if(!response.ok||value?.error)throw new ApiError(value?.error||'The request could not be completed. Please retry.',response.status);
 if(!value||typeof value!=='object')throw new ApiError('The server returned an invalid response. Please retry.',response.status);
 return value as T;
}
export async function financeRequest<T=any>(path:string,options:RequestInit={}){
 return readApiResponse<T>(await fetch(path,{...options,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...options.headers}}));
}
