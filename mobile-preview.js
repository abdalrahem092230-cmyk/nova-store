// Preview-only launcher for validating the mobile API without touching production Neon.
const http=require('http');
const mobileApi=require('./mobile-api');
const originalCreateServer=http.createServer;
http.createServer=function(listener){
  return originalCreateServer.call(http,async(req,res)=>{
    try{
      if(await mobileApi.handle(req,res))return;
    }catch(err){
      console.error('Mobile preview API error:',err);
      if(!res.headersSent){
        res.writeHead(500,{'content-type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({error:'Server Error'}));
      }
      return;
    }
    return listener(req,res);
  });
};
require('./server.js');
http.createServer=originalCreateServer;
