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

    const rendimento5000 = (dyMensal / 100) * 5000
    const rendimento10000 = (dyMensal / 100) * 10000

    // ⭐ SCORE (DY mais importante)
    const score = (dyAnual / 100) * 0.7 + (1 / r.pvpNumero) * 0.3

    r.score = score

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
<td>${score.toFixed(3)}</td>
<td>R$ ${rendimento5000.toFixed(2)}</td>
<td>R$ ${rendimento10000.toFixed(2)}</td>
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
width:1200px;
margin:auto;
font-size:15px;
box-shadow:0 4px 10px rgba(0,0,0,0.1);
}

th{
background:#4a90e2;
color:white;
padding:12px;
cursor:pointer;
position: sticky;
top: 0;
z-index: 2;
}

.seta{
margin-left:5px;
font-size:12px;
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

<table id="tabelaFiis">

<thead>
<tr>
<th onclick="ordenarTabela(0)">Ticker <span class="seta">↕</span></th>
<th onclick="ordenarTabela(1)">Preço <span class="seta">↕</span></th>
<th onclick="ordenarTabela(2)">P/VP <span class="seta">↕</span></th>
<th onclick="ordenarTabela(3)">DY 12m <span class="seta">↕</span></th>
<th onclick="ordenarTabela(4)">Último Provento <span class="seta">↕</span></th>
<th onclick="ordenarTabela(5)">DY Mensal <span class="seta">↕</span></th>
<th onclick="ordenarTabela(6)">DY Anual <span class="seta">↕</span></th>
<th onclick="ordenarTabela(7)">Score <span class="seta">↕</span></th>
<th onclick="ordenarTabela(8)">R$ 5.000 <span class="seta">↕</span></th>
<th onclick="ordenarTabela(9)">R$ 10.000 <span class="seta">↕</span></th>
</tr>
</thead>

<tbody>
${linhas}
</tbody>

</table>

<script>

let ordemAsc = true
let colunaAtual = -1

function ordenarTabela(coluna){

    const tabela = document.getElementById("tabelaFiis")
    const tbody = tabela.tBodies[0]
    const linhas = Array.from(tbody.rows)
    const headers = tabela.querySelectorAll("th")

    headers.forEach(th=>{
        th.querySelector(".seta").innerText = "↕"
    })

    if(coluna === colunaAtual){
        ordemAsc = !ordemAsc
    } else {
        ordemAsc = true
        colunaAtual = coluna
    }

    linhas.sort((a,b)=>{

        let valA = a.cells[coluna].innerText
        let valB = b.cells[coluna].innerText

        valA = valA.replace("R$","").replace("%","").replace(/\\./g,"").replace(",",".")
        valB = valB.replace("R$","").replace("%","").replace(/\\./g,"").replace(",",".")
        
        const numA = parseFloat(valA)
        const numB = parseFloat(valB)

        if(!isNaN(numA) && !isNaN(numB)){
            return ordemAsc ? numA - numB : numB - numA
        }

        return ordemAsc 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA)
    })

    const seta = headers[coluna].querySelector(".seta")
    seta.innerText = ordemAsc ? "↑" : "↓"

    linhas.forEach(linha => tbody.appendChild(linha))
}

</script>

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

    resultados.forEach(r=>{
        const pvp = r.pvpNumero
        const dy = parseFloat(r.dy?.replace("%","").replace(",","."))
        r.score = (dy / 100) * 0.7 + (1 / pvp) * 0.3
    })

    resultados.sort((a,b)=> b.score - a.score)

    gerarHtml(resultados)

    fiis.forEach(fii=>{
        fs.unlinkSync(`${fii}.html`)
        fs.unlinkSync(`${fii}.txt`)
    })

    if (fs.existsSync("dados.csv")) {
        fs.unlinkSync("dados.csv")
    }

}

main()