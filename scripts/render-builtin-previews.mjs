import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {renderEffectVideo} from './motion-library/render.mjs';
const compiled=JSON.parse(fs.readFileSync('src/lib/motion-library/builtin-compiled.json','utf8'));
const samples=[
  {id:'builtin_green_text',scenes:[{start:0,end:6,headline:'20% vs 80%',line1:'20%的人创造80%的业绩',line2:'把优秀经验变成团队能力',highlight:'80%的业绩'}]},
  {id:'builtin_green_diagram',scenes:[
    {start:0,end:4,headline:'企业知识库',line1:'数字员工',line2:'新人上手快',highlight:'上手快',diagramLayout:'flow'},
    {start:4,end:8,headline:'企业AI落地',line1:'数字分身',line2:'流程自动化',highlight:'自动化',diagramLayout:'branch'},
    {start:8,end:12,headline:'老员工经验',line1:'产品与客户案例',line2:'企业知识库',highlight:'知识库',diagramLayout:'merge'},
    {start:12,end:16,headline:'业务理解',line1:'AI认知深度',line2:'落地能力',highlight:'落地',diagramLayout:'equation'},
  ]},
];
fs.mkdirSync('public/motion-templates',{recursive:true});
for(const sample of samples){
  const output=path.resolve(`public/motion-templates/${sample.id}-v1.mp4`);
  await renderEffectVideo({template:{compiled:compiled[sample.id],assets:[],backgroundColor:'#194b36'},output,previewScenes:sample.scenes});
  execFileSync('ffmpeg',['-v','error','-y','-ss','3.4','-i',output,'-frames:v','1','-q:v','3',output.replace('.mp4','.jpg')]);
  console.log(`${sample.id}: preview and poster rendered`);
}
