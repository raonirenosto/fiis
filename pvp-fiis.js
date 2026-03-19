const axios = require("axios")
const cheerio = require("cheerio")
const fs = require("fs")

const fiis = [
"FATN11",
"TRXF11",
"GARE11",
"VISC11",
"PMLL11",
"TGAR11",
"XPLG11",
"HGLG11",
"KNRI11",
"BRCO11",
"XPML11",
"BTLG11",
"PVBI11",
"HGRU11"
]

async function processarFii(ticker){

    const url = `https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`

    try{

        const response = await axios.get(url,{
            headers:{ "User-Agent":"Mozilla/5.0" }
        })

        const html = response.data

        fs.writeFileSync(`${ticker}.html`, html)

        const $ = cheerio.load(html)

        let pvp = null
        let dy = null
        let precoAtual = null
        let ultimoProvento = null

        $("div").each((i,el)=>{

            const title = $(el).find(".title").text().trim()

            if(title.includes("P/VP")){
                pvp = $(el).find("strong.value").text().trim()
            }

            if($(el).attr("title") === "Dividend Yield com base nos últimos 12 meses"){
                dy = $(el).parent().find("strong.value").text().trim()
            }

            if(title.includes("Valor atual")){
                precoAtual = $(el).find("strong.value").text().trim()
            }

        })

        $("tr").each((i,el)=>{

            const primeiraColuna = $(el).find("td").first().text().trim()

            if(primeiraColuna === "Rendimento" && !ultimoProvento){

                ultimoProvento = $(el).find("td").last().text().trim()

            }

        })

        fs.writeFileSync(
`${ticker}.txt`,
`Ticker: ${ticker}
Preço Atual: ${precoAtual}
PVP: ${pvp}
DY: ${dy}
Ultimo Provento: ${ultimoProvento}`
        )

        return {
            ticker,
            precoAtual,
            pvpTexto: pvp,
            pvpNumero: parseFloat(pvp?.replace(",", ".")),
            dy,
            ultimoProvento
        }

    }catch(e){

        console.log("Erro:", ticker)
        return null

    }

}

function gerarHtml(resultados){

let linhas = ""

resultados.forEach(r=>{

    const preco = parseFloat(
        r.precoAtual
        .replace("R$","")
        .replace(/\./g,"")
        .replace(",",".")
    )

    const provento = parseFloat(
        r.ultimoProvento
        .replace(/\./g,"")
        .replace(",",".")
    )

    const dyMensal = (provento / preco) * 100
    const dyAnual = dyMensal * 12

    let classe = ""

    if(r.pvpNumero > 1){
        classe = "caro"
    }
    else if(dyAnual < 8){
        classe = "baixoDy"
    }

    linhas += `
<tr class="${classe}">
<td>${r.ticker}</td>
<td>${r.precoAtual}</td>
<td>${r.pvpTexto}</td>
<td>${r.dy}</td>
<td>${r.ultimoProvento}</td>
<td>${dyMensal.toFixed(2)}%</td>
<td>${dyAnual.toFixed(2)}%</td>
</tr>
`

})

const html = `
<html>
<head>
<meta charset="UTF-8">

<style>

body{
font-family: Arial;
background:#f4f8ff;
padding:40px;
}

h1{
text-align:center;
color:#1a3a6e;
}

table{
border-collapse:collapse;
width:1100px;
margin:auto;
font-size:15px;
box-shadow:0 4px 10px rgba(0,0,0,0.1);
}

th{
background:#4a90e2;
color:white;
padding:12px;
}

td{
padding:10px;
text-align:center;
}

tr:nth-child(even){
background:#e6f0ff;
}

tr:nth-child(odd){
background:#ffffff;
}

tr:hover{
background:#cfe2ff;
}

.caro{
background:#ffd6d6 !important;
}

.baixoDy{
background:#fff3b0 !important;
}

</style>

</head>

<body>

<h1>Scanner de FIIs</h1>

<table>

<tr>
<th>Ticker</th>
<th>Preço</th>
<th>P/VP</th>
<th>DY 12m</th>
<th>Último Provento</th>
<th>DY Mensal</th>
<th>DY Anual</th>
</tr>

${linhas}

</table>

</body>
</html>
`

fs.writeFileSync("resultado.html",html)

}

async function main(){

    const resultados = []

    for(const fii of fiis){

        const dados = await processarFii(fii)

        if(dados){
            resultados.push(dados)
        }

    }

    resultados.sort((a,b)=> a.pvpNumero - b.pvpNumero)

    gerarHtml(resultados)

    fiis.forEach(fii=>{
        fs.unlinkSync(`${fii}.html`)
        fs.unlinkSync(`${fii}.txt`)
    })

}

main()