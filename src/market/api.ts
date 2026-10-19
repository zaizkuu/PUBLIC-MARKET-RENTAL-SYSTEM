import type { Layout, Session } from './types';
export async function mapRequest<T>(path:string,options:{method?:string;body?:unknown;csrf?:string}={}):Promise<T> {
 const response=await fetch(`./api/market/${path}`,{method:options.method??'GET',credentials:'same-origin',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.csrf?{'X-Map-CSRF':options.csrf}:{})},body:options.body?JSON.stringify(options.body):undefined});
 const data=await response.json().catch(()=>({error:'The map service is unavailable. Run the app with npm run dev or npm run map:start.'}));
 if(!response.ok)throw new Error(data.error??'The request failed.');return data as T;
}
export const getPublished=()=>mapRequest<{layout:Layout;publishedAt:string}>('public');
export const getSession=()=>mapRequest<Session>('session');