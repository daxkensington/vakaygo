// Test-only bridge: real PostgreSQL queries using Neon's HTTP response shape.
const http=require("node:http");
const {Pool}=require(process.env.VAKAYGO_CI_PG_MODULE);
if(process.env.CI!=="true")throw Error("CI database bridge is restricted to CI");
const pool=new Pool({connectionString:process.env.DATABASE_URL});
http.createServer(async(req,res)=>{
  res.setHeader("Content-Type","application/json");
  if(req.method==="GET"){res.end('{"ok":true}');return;}
  let client;
  try{
    let raw="";for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);
    client=await pool.connect();
    const run=async({query,params})=>{
      const r=await client.query({text:query,values:params,rowMode:"array",types:{getTypeParser:()=>v=>v}});
      return {command:r.command,rowCount:r.rowCount,rowAsArray:true,fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows};
    };
    let result;
    if(body.queries){await client.query("BEGIN");try{result={results:[]};for(const q of body.queries)result.results.push(await run(q));await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}}
    else result=await run(body);
    res.end(JSON.stringify(result));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({message:e.message,code:e.code}));}
  finally{client?.release();}
}).listen(4444,"127.0.0.1",()=>console.log("CI PostgreSQL HTTP bridge ready"));
