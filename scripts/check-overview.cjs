// Release QA: compare the previous layout and the current layout against the same fixture.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {spawn,execFileSync}=require('node:child_process')
const {PrismaClient}=require('@prisma/client')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'overview-review-'))
const output=process.env.OVERVIEW_OUTPUT
fs.mkdirSync(output,{recursive:true})
const paths=['src/app/(dashboard)/page.tsx','src/app/globals.css']
const current=paths.map(p=>fs.readFileSync(p))
const database=path.join(temp,'demo.db')
fs.writeFileSync(database,'')
process.env.DATABASE_URL='file:'+database.replaceAll('\\','/')
process.env.JWT_SECRET=require('node:crypto').randomBytes(32).toString('hex')
process.env.NEXT_TELEMETRY_DISABLED='1'
const node=process.execPath
async function main(){
 execFileSync(node,['node_modules/prisma/build/index.js','db','push','--skip-generate'],{stdio:'inherit'})
 const db=new PrismaClient()
 const accountId='工程事业部'
 await db.account.create({data:{id:accountId}})
 const names=['陈思远','林嘉宁','周子恒','徐清和','张明远','吴安澜','赵文静','王志华']
 for(let i=0;i<32;i++){
  const expiry=new Date();expiry.setDate(expiry.getDate()+(i<7?i*12-28:200+i))
  await db.person.create({data:{accountId,name:names[i%8],orgName:['轨道交通建设事业部','市政工程一部','基础设施二部'][i%3],manager:'周宁',socialSecurity:i%5?'已缴纳':null,certificates:{create:{certType:['A','B','C2'][i%3],certNo:'建安〔2025〕'+String(300000+i),expiryDate:expiry.toISOString().slice(0,10)}}}})
 }
 await db.$disconnect()
 for(const mode of ['before','after']){
  paths.forEach((p,i)=>fs.writeFileSync(p,mode==='before'?execFileSync('git',['show','v0.7.6:'+p]):current[i]))
  fs.rmSync('.next',{recursive:true,force:true})
  const server=spawn(node,['node_modules/next/dist/bin/next','dev','-H','127.0.0.1','-p','34202'],{stdio:'inherit'})
  try {
    let ready=false
    for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:34202/login')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
    if(!ready) throw Error('Preview server did not start')
    for(const scale of mode==='before'?[1]:[1,1.25,1.5])execFileSync(require('electron'),['scripts/capture-overview.cjs',mode,String(scale),output],{stdio:'inherit',timeout:120000})
  } finally {execFileSync('taskkill',['/pid',String(server.pid),'/t','/f'],{stdio:'ignore'})}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{paths.forEach((p,i)=>fs.writeFileSync(p,current[i]));fs.rmSync(temp,{recursive:true,force:true,maxRetries:4})})
