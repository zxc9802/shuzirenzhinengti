import {canAccessEffect} from '@/lib/motion-library/access';
import {NextRequest,NextResponse} from 'next/server';
import {resolveAccessContext,unauthorizedResponse} from '@/lib/access-control';
import {EffectStore,publicEffect} from '@/lib/motion-library/store';
import {editLibrary} from '@/lib/motion-library/service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){const access=await resolveAccessContext(req);if(access.isolated&&!access.userId)return unauthorizedResponse();return NextResponse.json({effects:(await EffectStore.list()).filter(r=>canAccessEffect(access,r)).map(r=>publicEffect(r))},{headers:{'Cache-Control':'no-store'}});}
export const POST=(req:NextRequest)=>editLibrary(req);
