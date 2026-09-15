import 'server-only';
import compiled from './builtin-compiled.json' with {type:'json'};
import type {LibraryEffect} from './contract';
import type {StoredEffect} from './store';

const templates=[
  {id:'builtin_green_text',name:'绿金文字总结',description:'深绿金边背景，黄色标题、两行白字依次入场，重点词高亮。',code:compiled.builtin_green_text},
  {id:'builtin_green_diagram',name:'绿金流程图解',description:'线稿图标逐笔绘制，箭头连接概念，黄色圈线强调结论；支持流程、分支、汇总和公式。',code:compiled.builtin_green_diagram},
];
export function getBuiltinEffect(id:string):StoredEffect|undefined {
  const item=templates.find(t=>t.id===id);if(!item)return;
  return {id:item.id,name:item.name,status:'ready',message:item.description,saved:true,revision:1,updatedAt:0,messages:[],assets:[],versions:[{revision:1,sourceCode:'',compiled:item.code,backgroundColor:'#194b36',assets:[],preview:`/motion-templates/${item.id}-v1.mp4`}]};
}
export function publicBuiltinEffect(id:string,detail=false):LibraryEffect|undefined {
  const row=getBuiltinEffect(id);if(!row)return;
  const version=row.versions[0];
  return {id:row.id,name:row.name,builtin:true,status:'ready',message:row.message,saved:true,revision:1,updatedAt:0,messages:[],assets:[],previewUrl:version.preview,...(detail?{template:{compiled:version.compiled,assets:[],backgroundColor:version.backgroundColor}}:{})};
}
export const listBuiltinEffects=()=>templates.map(t=>publicBuiltinEffect(t.id)!);
