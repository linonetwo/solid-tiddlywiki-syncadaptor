function turtle2jsonld( turtleString, store, uri ){
  return new Promise(resolve=>{
    $rdf.parse( turtleString, store, uri, "text/turtle", e => {
        if(e) { console.log("Parse Error! "); return resolve(e) }
        $rdf.serialize(null,store, uri,'application/ld+json',(e,s)=>{
            if(e) { console.log("Serialize Error! "); return resolve(e) }
            return resolve(s)
        })
    })
  })
}
function jsonld2turtle( jsonldString, store, uri ){
  return new Promise(resolve=>{
    $rdf.parse( jsonldString, store, uri, "application/ld+json", e => {
        if(e) { console.log("Parse Error! "); return resolve(e) }
        $rdf.serialize(null,store, uri,'text/turtle',(e,s)=>{
            if(e) { console.log("Serialize Error! "); return resolve(e) }
            return resolve(s)
        })
    })
  })
}